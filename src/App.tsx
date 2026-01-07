import { useState, useEffect } from "react";
import "./App.css";
import { mailService, Email, User } from "./services/api";

function App() {
  const [authToken, setAuthToken] = useState("8d66ef93-beef-42da-baa3-2d655dd9b51d");
  const [activeTab, setActiveTab] = useState<'fetch' | 'add'>('fetch');
  
  // Fetch Email State
  const [toEmail, setToEmail] = useState("");
  const [emails, setEmails] = useState<Email[]>([]);
  const [fetchStatus, setFetchStatus] = useState("");
  const [isLoadingFetch, setIsLoadingFetch] = useState(false);

  // Add User State
  const [accountCount, setAccountCount] = useState<number>(10);
  const [parsedUsers, setParsedUsers] = useState<User[]>([]);
  const [addUserStatus, setAddUserStatus] = useState("");
  const [isAddingUsers, setIsAddingUsers] = useState(false);

  useEffect(() => {
    // Check for email in URL path
    let path = window.location.pathname;
    // Remove leading and trailing slashes
    path = path.replace(/^\/+|\/+$/g, '');
    
    console.log("[App] Checked path (raw):", path);

    // Try to decode first
    let decodedPath = "";
    try {
        decodedPath = decodeURIComponent(path);
    } catch (e) {
        console.error("Failed to decode path:", e);
        decodedPath = path;
    }
    
    console.log("[App] Decoded path:", decodedPath);

    // Check if the decoded path looks like an email (contains @)
    if (decodedPath && decodedPath.length > 3 && decodedPath.includes('@')) {
        console.log("[App] Found email in URL:", decodedPath);
        
        // Update state
        setToEmail(decodedPath);
        
        // Show status immediately
        setFetchStatus(`检测到邮箱 ${decodedPath}，正在自动查询...`);
        setIsLoadingFetch(true);

        // Automatically fetch emails for this address with a slight delay to ensure state updates
        setTimeout(() => {
            fetchEmails(decodedPath);
        }, 500);
    }
  }, []);

  async function fetchEmails(emailToFetch?: string | unknown) {
    const targetEmail = (typeof emailToFetch === 'string') ? emailToFetch : toEmail;
    
    if (!targetEmail) {
        setFetchStatus("请输入邮箱地址。");
        return;
    }
    setFetchStatus("获取中...");
    setIsLoadingFetch(true);
    try {
      const result = await mailService.fetchEmails(targetEmail, authToken);
      setEmails(result);
      setFetchStatus(`找到 ${result.length} 封邮件。`);
    } catch (error) {
      console.error(error);
      setFetchStatus(`错误: ${error}`);
    } finally {
      setIsLoadingFetch(false);
    }
  }

  function generateRandomString(length: number) {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let ret = "";
    for (let i = 0; i < length; ++i) {
      ret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return ret;
  }

  function generatePassword(length = 10) {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let ret = "";
    for (let i = 0; i < length; ++i) {
      ret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return ret;
  }

  function handleGenerateAccounts() {
    if (!accountCount || accountCount <= 0) {
        setAddUserStatus("请输入有效的生成数量。");
        return;
    }
    
    const users: User[] = [];
    for (let i = 0; i < accountCount; i++) {
        const username = generateRandomString(8);
        users.push({
            email: `${username}@tztright.top`,
            password: generatePassword()
        });
    }
    
    setParsedUsers(users);
    setAddUserStatus(`已生成 ${users.length} 个随机账号，准备添加。`);
  }

  function handleExportTxt() {
    if (parsedUsers.length === 0) {
        setAddUserStatus("没有可导出的用户。");
        return;
    }
    const content = parsedUsers.map(u => `${u.email}----${u.password}`).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users_${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function addUsers() {
    if (parsedUsers.length === 0) {
        setAddUserStatus("请先生成账号。");
        return;
    }
    setAddUserStatus("正在添加用户...");
    setIsAddingUsers(true);
    try {
      await mailService.addUsers(parsedUsers, authToken);
      setAddUserStatus("用户添加成功！");
      setParsedUsers([]); 
    } catch (error) {
      console.error(error);
      setAddUserStatus(`错误: ${error}`);
    } finally {
      setIsAddingUsers(false);
    }
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>CloudMail Manager</h1>
        <div className="auth-settings">
           <span>Token:</span>
           <input 
                type="text" 
                value={authToken} 
                onChange={e => setAuthToken(e.target.value)} 
                className="auth-input"
            />
        </div>
      </header>

      <main className="main-content">
        <div className="tabs">
            <button 
                className={`tab-btn ${activeTab === 'fetch' ? 'active' : ''}`}
                onClick={() => setActiveTab('fetch')}
            >
                邮件查询
            </button>
            <button 
                className={`tab-btn ${activeTab === 'add' ? 'active' : ''}`}
                onClick={() => setActiveTab('add')}
            >
                批量添加用户
            </button>
        </div>

        <div className="tab-content">
            {activeTab === 'fetch' && (
                <div className="card fade-in">
                    <div className="card-header">
                        <h2>查询收件箱</h2>
                        <p className="subtitle">输入邮箱地址查看最新邮件</p>
                    </div>
                    <div className="search-bar">
                        <input
                            type="email"
                            placeholder="例如: test@tztright.top"
                            value={toEmail}
                            onChange={(e) => setToEmail(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && fetchEmails()}
                        />
                        <button className="primary-btn" onClick={fetchEmails} disabled={isLoadingFetch}>
                            {isLoadingFetch ? '查询中...' : '查询'}
                        </button>
                    </div>
                    
                    {fetchStatus && <div className={`status-msg ${fetchStatus.includes('错误') ? 'error' : 'info'}`}>{fetchStatus}</div>}

                    <div className="email-list">
                        {emails.length === 0 ? (
                            <div className="empty-state">暂无邮件数据</div>
                        ) : (
                            emails.map((email) => (
                                <div key={email.emailId} className="email-item">
                                    <div className="email-row">
                                        <span className="label">主题:</span>
                                        <span className="value subject">{email.subject}</span>
                                    </div>
                                    <div className="email-row">
                                        <span className="label">发件人:</span>
                                        <span className="value">{email.sendName} &lt;{email.sendEmail}&gt;</span>
                                    </div>
                                    <div className="email-row">
                                        <span className="label">收件人:</span>
                                        <span className="value">{email.toName} &lt;{email.toEmail}&gt;</span>
                                    </div>
                                    <div className="email-row">
                                        <span className="label">时间:</span>
                                        <span className="value">{email.createTime}</span>
                                    </div>
                                    <div className="email-row content-row">
                                        <span className="label">内容:</span>
                                        <div 
                                            className="value content-html"
                                            dangerouslySetInnerHTML={{ __html: email.content }}
                                        />
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'add' && (
                <div className="card fade-in">
                    <div className="card-header">
                        <h2>批量添加用户</h2>
                        <p className="subtitle">输入生成的账号数量，自动生成 @tztright.top 邮箱</p>
                    </div>
                    
                    <div className="bulk-actions">
                        <div className="input-group">
                            <label>生成数量:</label>
                            <input
                                type="number"
                                className="bulk-input"
                                style={{width: '150px'}}
                                placeholder="输入数量"
                                value={accountCount}
                                onChange={e => setAccountCount(parseInt(e.target.value) || 0)}
                                min="1"
                            />
                        </div>
                        <div className="action-buttons">
                            <button className="secondary-btn" onClick={handleGenerateAccounts}>
                                1. 生成随机账号
                            </button>
                            <button 
                                className="secondary-btn" 
                                onClick={handleExportTxt} 
                                disabled={parsedUsers.length === 0}
                            >
                                2. 导出 TXT
                            </button>
                            <button 
                                className="primary-btn" 
                                onClick={addUsers} 
                                disabled={parsedUsers.length === 0 || isAddingUsers}
                            >
                                {isAddingUsers ? '添加中...' : '3. 提交添加'}
                            </button>
                        </div>
                    </div>

                    {addUserStatus && <div className={`status-msg ${addUserStatus.includes('错误') ? 'error' : 'success'}`}>{addUserStatus}</div>}
                    
                    {parsedUsers.length > 0 && (
                        <div className="preview-list">
                            <h3>待添加列表 ({parsedUsers.length})</h3>
                            <div className="list-container">
                                {parsedUsers.map((u, i) => (
                                    <div key={i} className="preview-item">
                                        <span className="email">{u.email}</span>
                                        <span className="divider">----</span>
                                        <span className="password">{u.password}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
      </main>
    </div>
  );
}

export default App;
