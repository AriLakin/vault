const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("SecretDEX", function () {
  async function deploySecretDEXFixture() {
    const [owner, trader1, trader2, liquidityProvider] = await ethers.getSigners();

    // Deploy SecretDEX
    const SecretDEX = await ethers.getContractFactory("SecretDEX");
    const secretDEX = await SecretDEX.deploy();
    await secretDEX.waitForDeployment();

    // Deploy test tokens
    const TestToken = await ethers.getContractFactory("TestToken");
    
    const tokenA = await TestToken.deploy("Token A", "TKA", 18, ethers.parseEther("1000000"));
    await tokenA.waitForDeployment();
    
    const tokenB = await TestToken.deploy("Token B", "TKB", 18, ethers.parseEther("1000000"));
    await tokenB.waitForDeployment();

    // Transfer tokens to users
    await tokenA.transfer(trader1.address, ethers.parseEther("10000"));
    await tokenA.transfer(trader2.address, ethers.parseEther("10000"));
    await tokenA.transfer(liquidityProvider.address, ethers.parseEther("50000"));
    
    await tokenB.transfer(trader1.address, ethers.parseEther("10000"));
    await tokenB.transfer(trader2.address, ethers.parseEther("10000"));
    await tokenB.transfer(liquidityProvider.address, ethers.parseEther("50000"));

    return {
      secretDEX,
      tokenA,
      tokenB,
      owner,
      trader1,
      trader2,
      liquidityProvider
    };
  }

  describe("Deployment", function () {
    it("Should deploy with correct initial parameters", async function () {
      const { secretDEX, owner } = await loadFixture(deploySecretDEXFixture);

      expect(await secretDEX.owner()).to.equal(owner.address);
      expect(await secretDEX.nextOrderId()).to.equal(1);
      expect(await secretDEX.nextPoolId()).to.equal(1);
      expect(await secretDEX.tradingFee()).to.equal(30); // 0.3%
    });
  });

  describe("Liquidity Pool Management", function () {
    it("Should create liquidity pool successfully", async function () {
      const { secretDEX, tokenA, tokenB, owner } = await loadFixture(deploySecretDEXFixture);

      await expect(
        secretDEX.connect(owner).createLiquidityPool(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          30 // 0.3% fee
        )
      ).to.emit(secretDEX, "LiquidityPoolCreated")
        .withArgs(1, await tokenA.getAddress(), await tokenB.getAddress(), await time.latest() + 1);

      const pool = await secretDEX.liquidityPools(1);
      expect(pool.tokenA).to.equal(await tokenA.getAddress());
      expect(pool.tokenB).to.equal(await tokenB.getAddress());
      expect(pool.feeRate).to.equal(30);
      expect(pool.isActive).to.equal(true);
    });

    it("Should reject duplicate liquidity pools", async function () {
      const { secretDEX, tokenA, tokenB, owner } = await loadFixture(deploySecretDEXFixture);

      // Create first pool
      await secretDEX.connect(owner).createLiquidityPool(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        30
      );

      // Try to create duplicate pool
      await expect(
        secretDEX.connect(owner).createLiquidityPool(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          25
        )
      ).to.be.revertedWith("Pool already exists");

      // Also test reverse order
      await expect(
        secretDEX.connect(owner).createLiquidityPool(
          await tokenB.getAddress(),
          await tokenA.getAddress(),
          25
        )
      ).to.be.revertedWith("Pool already exists");
    });

    it("Should reject invalid pool parameters", async function () {
      const { secretDEX, tokenA, tokenB, owner } = await loadFixture(deploySecretDEXFixture);

      // Same tokens
      await expect(
        secretDEX.connect(owner).createLiquidityPool(
          await tokenA.getAddress(),
          await tokenA.getAddress(),
          30
        )
      ).to.be.revertedWith("Identical tokens");

      // Zero address
      await expect(
        secretDEX.connect(owner).createLiquidityPool(
          ethers.ZeroAddress,
          await tokenB.getAddress(),
          30
        )
      ).to.be.revertedWith("Invalid token addresses");

      // Fee too high
      await expect(
        secretDEX.connect(owner).createLiquidityPool(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          1100 // Above 10% max
        )
      ).to.be.revertedWith("Fee rate too high");
    });

    it("Should allow only owner to create pools", async function () {
      const { secretDEX, tokenA, tokenB, trader1 } = await loadFixture(deploySecretDEXFixture);

      await expect(
        secretDEX.connect(trader1).createLiquidityPool(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          30
        )
      ).to.be.revertedWithCustomError(secretDEX, "OwnableUnauthorizedAccount");
    });
  });

  describe("Confidential Liquidity", function () {
    async function setupPoolFixture() {
      const fixture = await loadFixture(deploySecretDEXFixture);
      const { secretDEX, tokenA, tokenB, owner } = fixture;

      // Create liquidity pool
      await secretDEX.connect(owner).createLiquidityPool(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        30
      );

      return fixture;
    }

    it("Should add confidential liquidity successfully", async function () {
      const { secretDEX, liquidityProvider } = await loadFixture(setupPoolFixture);

      const amountA = ethers.parseEther("1000");
      const amountB = ethers.parseEther("2000");
      const nonce = 12345;

      const encryptedAmountA = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [amountA, nonce])
      );
      const encryptedAmountB = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [amountB, nonce + 1])
      );
      const zkProof = ethers.solidityPacked(
        ["uint256", "uint256", "uint256"],
        [amountA, amountB, nonce]
      );

      await expect(
        secretDEX.connect(liquidityProvider).addConfidentialLiquidity(
          1, // poolId
          encryptedAmountA,
          encryptedAmountB,
          zkProof
        )
      ).to.emit(secretDEX, "ConfidentialLiquidityAdded")
        .withArgs(1, liquidityProvider.address, encryptedAmountA, encryptedAmountB, await time.latest() + 1);

      // Verify pool was updated
      const pool = await secretDEX.liquidityPools(1);
      expect(pool.totalLiquidityProviders).to.equal(1);
    });

    it("Should reject invalid pool ID", async function () {
      const { secretDEX, liquidityProvider } = await loadFixture(setupPoolFixture);

      const amountA = ethers.parseEther("1000");
      const amountB = ethers.parseEther("2000");
      const nonce = 12345;

      const encryptedAmountA = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [amountA, nonce])
      );
      const encryptedAmountB = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [amountB, nonce + 1])
      );
      const zkProof = ethers.solidityPacked(
        ["uint256", "uint256", "uint256"],
        [amountA, amountB, nonce]
      );

      await expect(
        secretDEX.connect(liquidityProvider).addConfidentialLiquidity(
          999, // Invalid poolId
          encryptedAmountA,
          encryptedAmountB,
          zkProof
        )
      ).to.be.revertedWith("Invalid pool ID");
    });

    it("Should remove confidential liquidity", async function () {
      const { secretDEX, liquidityProvider } = await loadFixture(setupPoolFixture);

      // Add liquidity first
      const amountA = ethers.parseEther("1000");
      const amountB = ethers.parseEther("2000");
      const nonce = 12345;

      const encryptedAmountA = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [amountA, nonce])
      );
      const encryptedAmountB = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [amountB, nonce + 1])
      );
      const zkProof = ethers.solidityPacked(
        ["uint256", "uint256", "uint256"],
        [amountA, amountB, nonce]
      );

      await secretDEX.connect(liquidityProvider).addConfidentialLiquidity(
        1, encryptedAmountA, encryptedAmountB, zkProof
      );

      // Remove liquidity
      const sharesAmount = ethers.parseEther("500");
      const sharesNonce = 54321;
      const encryptedShares = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [sharesAmount, sharesNonce])
      );
      const sharesProof = ethers.solidityPacked(
        ["uint256", "uint256"],
        [sharesAmount, sharesNonce]
      );

      await expect(
        secretDEX.connect(liquidityProvider).removeConfidentialLiquidity(
          1, // poolId
          0, // positionIndex
          encryptedShares,
          sharesProof
        )
      ).to.emit(secretDEX, "ConfidentialLiquidityRemoved");

      // Verify pool was updated
      const pool = await secretDEX.liquidityPools(1);
      expect(pool.totalLiquidityProviders).to.equal(0);
    });
  });

  describe("Confidential Orders", function () {
    async function setupPoolWithLiquidityFixture() {
      const fixture = await loadFixture(deploySecretDEXFixture);
      const { secretDEX, tokenA, tokenB, owner, liquidityProvider } = fixture;

      // Create and setup pool with liquidity
      await secretDEX.connect(owner).createLiquidityPool(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        30
      );

      // Add initial liquidity
      const amountA = ethers.parseEther("10000");
      const amountB = ethers.parseEther("20000");
      const nonce = 12345;

      const encryptedAmountA = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [amountA, nonce])
      );
      const encryptedAmountB = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [amountB, nonce + 1])
      );
      const zkProof = ethers.solidityPacked(
        ["uint256", "uint256", "uint256"],
        [amountA, amountB, nonce]
      );

      await secretDEX.connect(liquidityProvider).addConfidentialLiquidity(
        1, encryptedAmountA, encryptedAmountB, zkProof
      );

      return fixture;
    }

    it("Should create confidential order successfully", async function () {
      const { secretDEX, tokenA, tokenB, trader1 } = await loadFixture(setupPoolWithLiquidityFixture);

      const amountA = ethers.parseEther("100");
      const amountB = ethers.parseEther("200");
      const price = ethers.parseEther("2");
      const nonce = 11111;

      const encryptedAmountA = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [amountA, nonce])
      );
      const encryptedAmountB = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [amountB, nonce + 1])
      );
      const encryptedPrice = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [price, nonce + 2])
      );
      const zkProof = ethers.solidityPacked(
        ["uint256", "uint256", "uint256"],
        [amountA, price, nonce]
      );

      await expect(
        secretDEX.connect(trader1).createConfidentialOrder(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          encryptedAmountA,
          encryptedAmountB,
          encryptedPrice,
          0, // BUY order
          zkProof
        )
      ).to.emit(secretDEX, "ConfidentialOrderCreated")
        .withArgs(1, trader1.address, await tokenA.getAddress(), await tokenB.getAddress(), 0, await time.latest() + 1);

      // Verify order details
      const order = await secretDEX.orders(1);
      expect(order.trader).to.equal(trader1.address);
      expect(order.tokenA).to.equal(await tokenA.getAddress());
      expect(order.tokenB).to.equal(await tokenB.getAddress());
      expect(order.orderType).to.equal(0); // BUY
      expect(order.status).to.equal(0); // PENDING
    });

    it("Should reject order with identical tokens", async function () {
      const { secretDEX, tokenA, trader1 } = await loadFixture(setupPoolWithLiquidityFixture);

      const amount = ethers.parseEther("100");
      const price = ethers.parseEther("2");
      const nonce = 11111;

      const encryptedAmount = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [amount, nonce])
      );
      const encryptedPrice = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [price, nonce + 1])
      );
      const zkProof = ethers.solidityPacked(
        ["uint256", "uint256", "uint256"],
        [amount, price, nonce]
      );

      await expect(
        secretDEX.connect(trader1).createConfidentialOrder(
          await tokenA.getAddress(),
          await tokenA.getAddress(), // Same token
          encryptedAmount,
          encryptedAmount,
          encryptedPrice,
          0,
          zkProof
        )
      ).to.be.revertedWith("Identical tokens");
    });

    it("Should fill confidential order", async function () {
      const { secretDEX, tokenA, tokenB, trader1, trader2 } = await loadFixture(setupPoolWithLiquidityFixture);

      // Create order first
      const amountA = ethers.parseEther("100");
      const price = ethers.parseEther("2");
      const nonce = 11111;

      const encryptedAmountA = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [amountA, nonce])
      );
      const encryptedPrice = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [price, nonce + 1])
      );
      const zkProof = ethers.solidityPacked(
        ["uint256", "uint256", "uint256"],
        [amountA, price, nonce]
      );

      await secretDEX.connect(trader1).createConfidentialOrder(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        encryptedAmountA,
        encryptedAmountA,
        encryptedPrice,
        0, // BUY
        zkProof
      );

      // Fill order
      const fillAmount = ethers.parseEther("50");
      const fillNonce = 22222;
      const encryptedFillAmount = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [fillAmount, fillNonce])
      );
      const fillProof = ethers.solidityPacked(
        ["uint256", "uint256"],
        [fillAmount, fillNonce]
      );

      await expect(
        secretDEX.connect(trader2).fillConfidentialOrder(
          1, // orderId
          encryptedFillAmount,
          fillProof
        )
      ).to.emit(secretDEX, "ConfidentialOrderFilled")
        .withArgs(1, trader1.address, encryptedFillAmount, await time.latest() + 1);

      // Verify order status
      const order = await secretDEX.orders(1);
      expect(order.status).to.equal(1); // FILLED
    });

    it("Should cancel order", async function () {
      const { secretDEX, tokenA, tokenB, trader1 } = await loadFixture(setupPoolWithLiquidityFixture);

      // Create order
      const amountA = ethers.parseEther("100");
      const price = ethers.parseEther("2");
      const nonce = 11111;

      const encryptedAmountA = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [amountA, nonce])
      );
      const encryptedPrice = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [price, nonce + 1])
      );
      const zkProof = ethers.solidityPacked(
        ["uint256", "uint256", "uint256"],
        [amountA, price, nonce]
      );

      await secretDEX.connect(trader1).createConfidentialOrder(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        encryptedAmountA,
        encryptedAmountA,
        encryptedPrice,
        0,
        zkProof
      );

      // Cancel order
      await secretDEX.connect(trader1).cancelOrder(1);

      const order = await secretDEX.orders(1);
      expect(order.status).to.equal(2); // CANCELLED
    });

    it("Should expire orders automatically", async function () {
      const { secretDEX, tokenA, tokenB, trader1 } = await loadFixture(setupPoolWithLiquidityFixture);

      // Create order
      const amountA = ethers.parseEther("100");
      const price = ethers.parseEther("2");
      const nonce = 11111;

      const encryptedAmountA = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [amountA, nonce])
      );
      const encryptedPrice = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [price, nonce + 1])
      );
      const zkProof = ethers.solidityPacked(
        ["uint256", "uint256", "uint256"],
        [amountA, price, nonce]
      );

      await secretDEX.connect(trader1).createConfidentialOrder(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        encryptedAmountA,
        encryptedAmountA,
        encryptedPrice,
        0,
        zkProof
      );

      // Fast forward past expiry
      await time.increase(25 * 60 * 60); // 25 hours

      // Expire order
      await secretDEX.expireOrder(1);

      const order = await secretDEX.orders(1);
      expect(order.status).to.equal(3); // EXPIRED
    });
  });

  describe("Confidential Swaps", function () {
    async function setupSwapFixture() {
      const fixture = await loadFixture(deploySecretDEXFixture);
      const { secretDEX, tokenA, tokenB, owner, liquidityProvider } = fixture;

      // Create pool
      await secretDEX.connect(owner).createLiquidityPool(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        30
      );

      // Add substantial liquidity
      const amountA = ethers.parseEther("100000");
      const amountB = ethers.parseEther("200000");
      const nonce = 12345;

      const encryptedAmountA = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [amountA, nonce])
      );
      const encryptedAmountB = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [amountB, nonce + 1])
      );
      const zkProof = ethers.solidityPacked(
        ["uint256", "uint256", "uint256"],
        [amountA, amountB, nonce]
      );

      await secretDEX.connect(liquidityProvider).addConfidentialLiquidity(
        1, encryptedAmountA, encryptedAmountB, zkProof
      );

      return fixture;
    }

    it("Should execute confidential swap", async function () {
      const { secretDEX, tokenA, tokenB, trader1 } = await loadFixture(setupSwapFixture);

      const amountIn = ethers.parseEther("1000");
      const minAmountOut = ethers.parseEther("1800");
      const nonce = 33333;

      const encryptedAmountIn = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [amountIn, nonce])
      );
      const encryptedMinAmountOut = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [minAmountOut, nonce + 1])
      );
      const zkProof = ethers.solidityPacked(
        ["uint256", "uint256", "uint256"],
        [amountIn, minAmountOut, nonce]
      );

      await expect(
        secretDEX.connect(trader1).executeConfidentialSwap(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          encryptedAmountIn,
          encryptedMinAmountOut,
          zkProof
        )
      ).to.emit(secretDEX, "ConfidentialSwap")
        .withArgs(
          trader1.address,
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          encryptedAmountIn,
          await ethers.provider.send("eth_getStorageAt", [await secretDEX.getAddress(), "0x0"]), // Mock encrypted output
          await time.latest() + 1
        );
    });

    it("Should reject swap with identical tokens", async function () {
      const { secretDEX, tokenA, trader1 } = await loadFixture(setupSwapFixture);

      const amountIn = ethers.parseEther("1000");
      const minAmountOut = ethers.parseEther("1800");
      const nonce = 33333;

      const encryptedAmountIn = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [amountIn, nonce])
      );
      const encryptedMinAmountOut = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [minAmountOut, nonce + 1])
      );
      const zkProof = ethers.solidityPacked(
        ["uint256", "uint256", "uint256"],
        [amountIn, minAmountOut, nonce]
      );

      await expect(
        secretDEX.connect(trader1).executeConfidentialSwap(
          await tokenA.getAddress(),
          await tokenA.getAddress(), // Same token
          encryptedAmountIn,
          encryptedMinAmountOut,
          zkProof
        )
      ).to.be.revertedWith("Identical tokens");
    });

    it("Should reject swap for non-existent pool", async function () {
      const { secretDEX, tokenA, trader1 } = await loadFixture(setupSwapFixture);

      // Deploy a third token that has no pool
      const TestToken = await ethers.getContractFactory("TestToken");
      const tokenC = await TestToken.deploy("Token C", "TKC", 18, ethers.parseEther("1000000"));
      await tokenC.waitForDeployment();

      const amountIn = ethers.parseEther("1000");
      const minAmountOut = ethers.parseEther("1800");
      const nonce = 33333;

      const encryptedAmountIn = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [amountIn, nonce])
      );
      const encryptedMinAmountOut = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [minAmountOut, nonce + 1])
      );
      const zkProof = ethers.solidityPacked(
        ["uint256", "uint256", "uint256"],
        [amountIn, minAmountOut, nonce]
      );

      await expect(
        secretDEX.connect(trader1).executeConfidentialSwap(
          await tokenA.getAddress(),
          await tokenC.getAddress(),
          encryptedAmountIn,
          encryptedMinAmountOut,
          zkProof
        )
      ).to.be.revertedWith("Pool does not exist");
    });
  });

  describe("Platform Management", function () {
    it("Should update trading fee", async function () {
      const { secretDEX, owner } = await loadFixture(deploySecretDEXFixture);

      await secretDEX.connect(owner).setTradingFee(25); // 0.25%
      expect(await secretDEX.tradingFee()).to.equal(25);
    });

    it("Should reject trading fee above maximum", async function () {
      const { secretDEX, owner } = await loadFixture(deploySecretDEXFixture);

      await expect(
        secretDEX.connect(owner).setTradingFee(1100) // Above 10% max
      ).to.be.revertedWith("Fee too high");
    });

    it("Should pause and resume pools", async function () {
      const { secretDEX, tokenA, tokenB, owner } = await loadFixture(deploySecretDEXFixture);

      // Create pool
      await secretDEX.connect(owner).createLiquidityPool(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        30
      );

      // Pause pool
      await secretDEX.connect(owner).pausePool(1);
      let pool = await secretDEX.liquidityPools(1);
      expect(pool.isActive).to.equal(false);

      // Resume pool
      await secretDEX.connect(owner).resumePool(1);
      pool = await secretDEX.liquidityPools(1);
      expect(pool.isActive).to.equal(true);
    });
  });

  describe("View Functions", function () {
    it("Should return pool information", async function () {
      const { secretDEX, tokenA, tokenB, owner } = await loadFixture(deploySecretDEXFixture);

      await secretDEX.connect(owner).createLiquidityPool(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        30
      );

      const poolInfo = await secretDEX.getPoolInfo(1);
      expect(poolInfo.tokenA).to.equal(await tokenA.getAddress());
      expect(poolInfo.tokenB).to.equal(await tokenB.getAddress());
      expect(poolInfo.feeRate).to.equal(30);
      expect(poolInfo.isActive).to.equal(true);
    });

    it("Should return user orders", async function () {
      const { secretDEX, tokenA, tokenB, trader1, owner } = await loadFixture(deploySecretDEXFixture);

      // Setup
      await secretDEX.connect(owner).createLiquidityPool(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        30
      );

      // Create order
      const amountA = ethers.parseEther("100");
      const price = ethers.parseEther("2");
      const nonce = 11111;

      const encryptedAmountA = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [amountA, nonce])
      );
      const encryptedPrice = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [price, nonce + 1])
      );
      const zkProof = ethers.solidityPacked(
        ["uint256", "uint256", "uint256"],
        [amountA, price, nonce]
      );

      await secretDEX.connect(trader1).createConfidentialOrder(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        encryptedAmountA,
        encryptedAmountA,
        encryptedPrice,
        0,
        zkProof
      );

      const userOrders = await secretDEX.getUserOrders(trader1.address);
      expect(userOrders.length).to.equal(1);
      expect(userOrders[0]).to.equal(1);
    });

    it("Should return active orders count", async function () {
      const { secretDEX, tokenA, tokenB, trader1, owner } = await loadFixture(deploySecretDEXFixture);

      expect(await secretDEX.getActiveOrdersCount()).to.equal(0);

      // Setup and create order
      await secretDEX.connect(owner).createLiquidityPool(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        30
      );

      const amountA = ethers.parseEther("100");
      const price = ethers.parseEther("2");
      const nonce = 11111;

      const encryptedAmountA = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [amountA, nonce])
      );
      const encryptedPrice = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [price, nonce + 1])
      );
      const zkProof = ethers.solidityPacked(
        ["uint256", "uint256", "uint256"],
        [amountA, price, nonce]
      );

      await secretDEX.connect(trader1).createConfidentialOrder(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        encryptedAmountA,
        encryptedAmountA,
        encryptedPrice,
        0,
        zkProof
      );

      expect(await secretDEX.getActiveOrdersCount()).to.equal(1);
    });
  });
});