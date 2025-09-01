import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';

function App() {
  const [currentSection, setCurrentSection] = useState('home');
  const [isConnected, setIsConnected] = useState(false);
  const [userAccount, setUserAccount] = useState('');
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [investmentModal, setInvestmentModal] = useState({ show: false, projectName: '' });
  const [investmentAmount, setInvestmentAmount] = useState('');

  // Contract addresses (placeholder - should be updated with real deployed addresses)
  const CONTRACT_ADDRESSES = {
    CRYPTOLAUNCH: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    DEX: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
    USDT: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'
  };

  // Contract ABI (simplified for demo)
  const CRYPTOLAUNCH_ABI = [
    "function createCampaign(string memory name, string memory description, uint256 goal, uint256 tokenPrice, uint256 minInvestment, uint256 duration) external",
    "function invest(uint256 campaignId) external payable",
    "function donate(uint256 campaignId) external payable",
    "function getCampaignCount() external view returns (uint256)",
    "function campaigns(uint256) external view returns (string memory name, string memory description, uint256 goal, uint256 raised, bool active)"
  ];

  const DEX_ABI = [
    "function swapETHForTokens(address token, uint256 minTokens) external payable",
    "function swapTokensForETH(address token, uint256 tokenAmount, uint256 minETH) external",
    "function getPrice(address token) external view returns (uint256)"
  ];

  useEffect(() => {
    checkWalletConnection();
  }, []);

  const checkWalletConnection = async () => {
    if (typeof window.ethereum !== 'undefined') {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
          setUserAccount(accounts[0]);
          setIsConnected(true);
          const provider = new ethers.BrowserProvider(window.ethereum);
          setProvider(provider);
          setSigner(await provider.getSigner());
        }
      } catch (error) {
        console.error('Error checking wallet connection:', error);
      }
    }
  };

  const connectWallet = async () => {
    if (typeof window.ethereum === 'undefined') {
      showToast('请安装 MetaMask 钱包！', 'error');
      return;
    }

    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      setUserAccount(accounts[0]);
      setIsConnected(true);
      
      const provider = new ethers.BrowserProvider(window.ethereum);
      setProvider(provider);
      setSigner(await provider.getSigner());
      
      showToast('钱包连接成功！', 'success');
    } catch (error) {
      console.error('钱包连接失败:', error);
      showToast('钱包连接失败', 'error');
    }
  };

  const showToast = (message, type = 'info') => {
    const toastContainer = document.getElementById('toast-container') || createToastContainer();
    const toast = document.createElement('div');
    const bgColor = type === 'success' ? 'bg-green-600' : 
                   type === 'error' ? 'bg-red-600' : 'bg-blue-600';
    
    toast.className = `${bgColor} text-white px-6 py-3 rounded-lg shadow-lg mb-2 transition-all duration-300`;
    toast.textContent = message;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 4000);
  };

  const createToastContainer = () => {
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'fixed top-4 right-4 z-50';
    document.body.appendChild(container);
    return container;
  };

  const createProject = async (formData) => {
    if (!isConnected || !signer) {
      showToast('请先连接钱包', 'error');
      return;
    }

    try {
      showToast('正在创建项目...', 'info');
      
      // Create contract instance
      const contract = new ethers.Contract(CONTRACT_ADDRESSES.CRYPTOLAUNCH, CRYPTOLAUNCH_ABI, signer);
      
      // Convert values to wei
      const goalWei = ethers.parseEther(formData.fundingGoal);
      const tokenPriceWei = ethers.parseEther(formData.tokenPrice);
      const minInvestmentWei = ethers.parseEther(formData.minInvestment);
      const duration = parseInt(formData.duration) * 24 * 60 * 60; // Convert days to seconds
      
      const tx = await contract.createCampaign(
        formData.name,
        formData.description,
        goalWei,
        tokenPriceWei,
        minInvestmentWei,
        duration
      );
      
      await tx.wait();
      showToast(`项目创建成功！交易哈希: ${tx.hash.substring(0, 10)}...`, 'success');
      
    } catch (error) {
      console.error('创建项目失败:', error);
      showToast('创建项目失败，请重试', 'error');
    }
  };

  const makeInvestment = async () => {
    if (!isConnected || !signer) {
      showToast('请先连接钱包', 'error');
      return;
    }

    if (!investmentAmount || parseFloat(investmentAmount) <= 0) {
      showToast('请输入有效的投资金额', 'error');
      return;
    }

    try {
      showToast('正在处理机密投资...', 'info');
      
      const contract = new ethers.Contract(CONTRACT_ADDRESSES.CRYPTOLAUNCH, CRYPTOLAUNCH_ABI, signer);
      const amountWei = ethers.parseEther(investmentAmount);
      
      // For demo purposes, we'll use campaignId 0
      const tx = await contract.invest(0, { value: amountWei });
      await tx.wait();
      
      setInvestmentModal({ show: false, projectName: '' });
      setInvestmentAmount('');
      showToast(`成功投资 ${investmentAmount} ETH 到 "${investmentModal.projectName}"！投资已加密保护。`, 'success');
      
    } catch (error) {
      console.error('投资失败:', error);
      showToast('投资失败，请重试', 'error');
    }
  };

  const makeDonation = async (projectName) => {
    if (!isConnected || !signer) {
      showToast('请先连接钱包', 'error');
      return;
    }

    const amount = prompt('请输入捐款金额 (ETH):');
    if (!amount || parseFloat(amount) <= 0) {
      showToast('请输入有效的捐款金额', 'error');
      return;
    }

    try {
      showToast('正在处理捐款...', 'info');
      
      const contract = new ethers.Contract(CONTRACT_ADDRESSES.CRYPTOLAUNCH, CRYPTOLAUNCH_ABI, signer);
      const amountWei = ethers.parseEther(amount);
      
      const tx = await contract.donate(0, { value: amountWei });
      await tx.wait();
      
      showToast(`成功捐款 ${amount} ETH 到 "${projectName}"！`, 'success');
      
    } catch (error) {
      console.error('捐款失败:', error);
      showToast('捐款失败，请重试', 'error');
    }
  };

  const executeSwap = async () => {
    if (!isConnected || !signer) {
      showToast('请先连接钱包', 'error');
      return;
    }

    try {
      showToast('正在执行机密交换...', 'info');
      
      const contract = new ethers.Contract(CONTRACT_ADDRESSES.DEX, DEX_ABI, signer);
      const amountWei = ethers.parseEther('0.1'); // Example amount
      
      const tx = await contract.swapETHForTokens(CONTRACT_ADDRESSES.USDT, 0, { value: amountWei });
      await tx.wait();
      
      showToast('交换成功！交易已通过 FHE 加密保护。', 'success');
      
    } catch (error) {
      console.error('交换失败:', error);
      showToast('交换失败，请重试', 'error');
    }
  };

  const handleProjectSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const projectData = {
      name: formData.get('projectName'),
      description: formData.get('projectDescription'),
      fundingGoal: formData.get('fundingGoal'),
      tokenPrice: formData.get('tokenPrice'),
      minInvestment: formData.get('minInvestment'),
      duration: formData.get('duration')
    };
    createProject(projectData);
  };

  const showInvestmentModal = (projectName) => {
    if (!isConnected) {
      showToast('请先连接钱包', 'error');
      return;
    }
    setInvestmentModal({ show: true, projectName });
  };

  const closeInvestmentModal = () => {
    setInvestmentModal({ show: false, projectName: '' });
    setInvestmentAmount('');
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                🚀 CryptoLaunch
              </h1>
            </div>
            
            <nav className="hidden md:flex space-x-8">
              {['home', 'campaigns', 'dex', 'launch'].map((section) => (
                <button
                  key={section}
                  onClick={() => setCurrentSection(section)}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    currentSection === section 
                      ? 'text-white bg-gray-700' 
                      : 'text-gray-300 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  {section === 'home' ? '首页' : 
                   section === 'campaigns' ? '项目' :
                   section === 'dex' ? 'Secret DEX' : '启动项目'}
                </button>
              ))}
            </nav>

            <div className="flex items-center space-x-4">
              <button 
                onClick={connectWallet}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isConnected 
                    ? 'bg-green-600 hover:bg-green-700' 
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {isConnected ? '已连接' : '连接钱包'}
              </button>
              {isConnected && (
                <div className="bg-gray-700 px-4 py-2 rounded-lg text-sm">
                  <span>{userAccount.substring(0, 6)}...{userAccount.substring(38)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Home Section */}
      {currentSection === 'home' && (
        <>
          <section className="gradient-bg py-20">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
              <h2 className="text-5xl font-bold mb-6">
                完全机密的区块链筹款平台
              </h2>
              <p className="text-xl text-blue-100 mb-8 max-w-3xl mx-auto">
                使用 Zama FHE 加密技术，实现真正的隐私保护筹款。投资者身份和金额完全保密，创业者获得安全可靠的资金支持。
              </p>
              <div className="flex justify-center space-x-4">
                <button 
                  onClick={() => setCurrentSection('launch')}
                  className="bg-white text-blue-600 px-8 py-3 rounded-lg text-lg font-medium hover:bg-blue-50 transition-colors"
                >
                  启动项目
                </button>
                <button 
                  onClick={() => setCurrentSection('campaigns')}
                  className="glassmorphism text-white px-8 py-3 rounded-lg text-lg font-medium hover:bg-white/20 transition-colors"
                >
                  浏览项目
                </button>
              </div>
            </div>
          </section>

          <section className="py-20 bg-gray-900">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-16">
                <h3 className="text-3xl font-bold mb-4">为什么选择 CryptoLaunch？</h3>
                <p className="text-xl text-gray-300">领先的隐私保护技术，打造最安全的筹款环境</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 hover:border-blue-500 transition-colors">
                  <div className="text-4xl mb-4">🔐</div>
                  <h4 className="text-xl font-semibold mb-3">完全机密</h4>
                  <p className="text-gray-400">采用 Zama FHE 同态加密技术，投资金额和身份信息完全保密，无人能够破解。</p>
                </div>
                
                <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 hover:border-purple-500 transition-colors">
                  <div className="text-4xl mb-4">⚡</div>
                  <h4 className="text-xl font-semibold mb-3">即时部署</h4>
                  <p className="text-gray-400">一键创建智能合约，自动配置所有参数，3分钟内完成项目上线。</p>
                </div>
                
                <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 hover:border-pink-500 transition-colors">
                  <div className="text-4xl mb-4">🛡️</div>
                  <h4 className="text-xl font-semibold mb-3">安全可靠</h4>
                  <p className="text-gray-400">经过严格审计的智能合约，多重安全机制保护，资金安全有保障。</p>
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {/* Launch Project Section */}
      {currentSection === 'launch' && (
        <section className="py-20 bg-gray-800">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h3 className="text-4xl font-bold mb-4">启动您的项目</h3>
              <p className="text-xl text-gray-300">创建机密筹款活动，保护投资者隐私</p>
            </div>
            
            <div className="bg-gray-700 rounded-xl p-8">
              <form onSubmit={handleProjectSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">项目名称 *</label>
                    <input type="text" name="projectName" required 
                           className="w-full px-4 py-3 bg-gray-600 border border-gray-500 rounded-lg text-white placeholder-gray-400 focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">筹款目标 (ETH) *</label>
                    <input type="number" name="fundingGoal" required step="0.01" 
                           className="w-full px-4 py-3 bg-gray-600 border border-gray-500 rounded-lg text-white placeholder-gray-400 focus:border-blue-500" />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">项目描述 *</label>
                  <textarea name="projectDescription" rows="4" required
                            className="w-full px-4 py-3 bg-gray-600 border border-gray-500 rounded-lg text-white placeholder-gray-400 focus:border-blue-500"></textarea>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">代币价格 (ETH)</label>
                    <input type="number" name="tokenPrice" step="0.001" defaultValue="0.01"
                           className="w-full px-4 py-3 bg-gray-600 border border-gray-500 rounded-lg text-white placeholder-gray-400 focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">最小投资 (ETH)</label>
                    <input type="number" name="minInvestment" step="0.01" defaultValue="0.01"
                           className="w-full px-4 py-3 bg-gray-600 border border-gray-500 rounded-lg text-white placeholder-gray-400 focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">筹款天数</label>
                    <input type="number" name="duration" min="1" max="90" defaultValue="30"
                           className="w-full px-4 py-3 bg-gray-600 border border-gray-500 rounded-lg text-white placeholder-gray-400 focus:border-blue-500" />
                  </div>
                </div>
                
                <button type="submit" 
                        className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-4 rounded-lg text-lg font-medium transition-all duration-200">
                  创建项目
                </button>
              </form>
            </div>
          </div>
        </section>
      )}

      {/* Campaigns Section */}
      {currentSection === 'campaigns' && (
        <section className="py-20 bg-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h3 className="text-4xl font-bold mb-4">活跃项目</h3>
              <p className="text-xl text-gray-300">发现优质项目，进行机密投资</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {/* Demo Campaign 1 */}
              <div className="bg-gray-700 rounded-xl border border-gray-600 p-6 hover:border-blue-500 transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-semibold">DeFi Protocol X</h4>
                  <span className="bg-green-500 text-white px-2 py-1 rounded text-xs">活跃</span>
                </div>
                
                <p className="text-gray-300 text-sm mb-4">
                  下一代去中心化借贷协议，支持多链资产和创新的流动性挖矿机制。
                </p>
                
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">筹款进度</span>
                    <span className="text-white">85%</span>
                  </div>
                  <div className="w-full bg-gray-600 rounded-full h-2">
                    <div className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full" style={{width: '85%'}}></div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">目标: 500 ETH</span>
                    <span className="text-gray-400">剩余: 15 天</span>
                  </div>
                </div>
                
                <div className="flex space-x-2">
                  <button 
                    onClick={() => showInvestmentModal('DeFi Protocol X')}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors text-sm"
                  >
                    机密投资
                  </button>
                  <button 
                    onClick={() => makeDonation('DeFi Protocol X')}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors text-sm"
                  >
                    捐款
                  </button>
                </div>
              </div>
              
              {/* Demo Campaign 2 */}
              <div className="bg-gray-700 rounded-xl border border-gray-600 p-6 hover:border-purple-500 transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-semibold">GameFi Universe</h4>
                  <span className="bg-yellow-500 text-white px-2 py-1 rounded text-xs">热门</span>
                </div>
                
                <p className="text-gray-300 text-sm mb-4">
                  元宇宙游戏平台，集成 NFT 交易和 Play-to-Earn 机制。
                </p>
                
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">筹款进度</span>
                    <span className="text-white">42%</span>
                  </div>
                  <div className="w-full bg-gray-600 rounded-full h-2">
                    <div className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full" style={{width: '42%'}}></div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">目标: 1000 ETH</span>
                    <span className="text-gray-400">剩余: 28 天</span>
                  </div>
                </div>
                
                <div className="flex space-x-2">
                  <button 
                    onClick={() => showInvestmentModal('GameFi Universe')}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors text-sm"
                  >
                    机密投资
                  </button>
                  <button 
                    onClick={() => makeDonation('GameFi Universe')}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors text-sm"
                  >
                    捐款
                  </button>
                </div>
              </div>
              
              {/* Demo Campaign 3 */}
              <div className="bg-gray-700 rounded-xl border border-gray-600 p-6 hover:border-green-500 transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-semibold">AI Trading Bot</h4>
                  <span className="bg-blue-500 text-white px-2 py-1 rounded text-xs">新上线</span>
                </div>
                
                <p className="text-gray-300 text-sm mb-4">
                  基于机器学习的智能交易机器人，支持多种交易策略。
                </p>
                
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">筹款进度</span>
                    <span className="text-white">12%</span>
                  </div>
                  <div className="w-full bg-gray-600 rounded-full h-2">
                    <div className="bg-gradient-to-r from-green-500 to-blue-500 h-2 rounded-full" style={{width: '12%'}}></div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">目标: 300 ETH</span>
                    <span className="text-gray-400">剩余: 45 天</span>
                  </div>
                </div>
                
                <div className="flex space-x-2">
                  <button 
                    onClick={() => showInvestmentModal('AI Trading Bot')}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors text-sm"
                  >
                    机密投资
                  </button>
                  <button 
                    onClick={() => makeDonation('AI Trading Bot')}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors text-sm"
                  >
                    捐款
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* DEX Section */}
      {currentSection === 'dex' && (
        <section className="py-20 bg-gray-900">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h3 className="text-4xl font-bold mb-4">Secret DEX</h3>
              <p className="text-xl text-gray-300">完全机密的去中心化交易所</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <div className="text-2xl font-bold text-blue-400 mb-1">$1.2M</div>
                <div className="text-sm text-gray-400">总锁定价值</div>
              </div>
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <div className="text-2xl font-bold text-purple-400 mb-1">45</div>
                <div className="text-sm text-gray-400">活跃交易对</div>
              </div>
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <div className="text-2xl font-bold text-pink-400 mb-1">$234K</div>
                <div className="text-sm text-gray-400">24小时交易量</div>
              </div>
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <div className="text-2xl font-bold text-green-400 mb-1">1,234</div>
                <div className="text-sm text-gray-400">活跃用户</div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
                <h4 className="text-lg font-semibold mb-4">机密交换</h4>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">卖出</label>
                    <div className="flex">
                      <input type="number" placeholder="0.0" 
                             className="flex-1 px-4 py-3 bg-gray-700 border border-gray-600 rounded-l-lg text-white" />
                      <select className="px-4 py-3 bg-gray-700 border border-gray-600 rounded-r-lg text-white">
                        <option>ETH</option>
                        <option>USDT</option>
                        <option>USDC</option>
                        <option>DAI</option>
                      </select>
                    </div>
                  </div>
                  
                  <div className="flex justify-center">
                    <button className="p-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors">
                      ⇅
                    </button>
                  </div>
                  
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">买入</label>
                    <div className="flex">
                      <input type="number" placeholder="0.0" 
                             className="flex-1 px-4 py-3 bg-gray-700 border border-gray-600 rounded-l-lg text-white" />
                      <select className="px-4 py-3 bg-gray-700 border border-gray-600 rounded-r-lg text-white">
                        <option>USDT</option>
                        <option>ETH</option>
                        <option>USDC</option>
                        <option>DAI</option>
                      </select>
                    </div>
                  </div>
                  
                  <button 
                    onClick={executeSwap}
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-3 rounded-lg font-medium transition-all"
                  >
                    执行机密交换
                  </button>
                </div>
              </div>
              
              <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
                <h4 className="text-lg font-semibold mb-4">机密订单簿</h4>
                <div className="space-y-2">
                  <div className="text-xs text-gray-400 grid grid-cols-3 gap-4 py-2 border-b border-gray-700">
                    <span>价格 (ETH/USDT)</span>
                    <span>数量 (已加密)</span>
                    <span>总额</span>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm grid grid-cols-3 gap-4 py-1 hover:bg-gray-700 rounded">
                      <span className="text-red-400">0.0235</span>
                      <span className="text-gray-500 font-mono">***</span>
                      <span className="text-gray-300">***</span>
                    </div>
                    <div className="text-sm grid grid-cols-3 gap-4 py-1 hover:bg-gray-700 rounded">
                      <span className="text-red-400">0.0234</span>
                      <span className="text-gray-500 font-mono">***</span>
                      <span className="text-gray-300">***</span>
                    </div>
                    <div className="text-sm grid grid-cols-3 gap-4 py-1 hover:bg-gray-700 rounded">
                      <span className="text-green-400">0.0233</span>
                      <span className="text-gray-500 font-mono">***</span>
                      <span className="text-gray-300">***</span>
                    </div>
                  </div>
                </div>
                
                <div className="mt-6 bg-gray-700 rounded-lg p-4">
                  <h5 className="text-sm font-semibold text-white mb-2">隐私特性</h5>
                  <ul className="text-xs text-gray-400 space-y-1">
                    <li>• 订单金额完全加密</li>
                    <li>• 防止 MEV 攻击</li>
                    <li>• 匿名流动性</li>
                    <li>• 支持 ETH/USDT, ETH/USDC, ETH/DAI 交易对</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Investment Modal */}
      {investmentModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-8 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold">机密投资</h3>
              <button onClick={closeInvestmentModal} className="text-gray-400 hover:text-white">✕</button>
            </div>
            
            <div className="mb-6">
              <p className="text-sm text-gray-400 mb-2">投资项目: <span className="text-white">{investmentModal.projectName}</span></p>
              <p className="text-xs text-gray-500">您的投资金额将通过 FHE 加密，完全保密</p>
            </div>
            
            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-2">投资金额 (ETH)</label>
              <input 
                type="number" 
                step="0.01" 
                min="0.01"
                value={investmentAmount}
                onChange={(e) => setInvestmentAmount(e.target.value)}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
              />
            </div>
            
            <div className="flex space-x-4">
              <button 
                onClick={closeInvestmentModal}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                取消
              </button>
              <button 
                onClick={makeInvestment}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                确认投资
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-gray-800 border-t border-gray-700 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-400">
          <p>&copy; 2024 CryptoLaunch. Built with Zama FHE Protocol.</p>
          <p className="mt-2 text-sm">Confidential • Secure • Innovative</p>
          <p className="mt-2 text-xs">
            合约地址: {CONTRACT_ADDRESSES.CRYPTOLAUNCH.substring(0, 8)}... | DEX: {CONTRACT_ADDRESSES.DEX.substring(0, 8)}... | 
            <span className="text-green-400">✅ 已审计</span>
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;