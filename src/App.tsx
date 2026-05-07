import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import "./App.css";
import { ApiConfig, Email, User, mailService } from "./services/api";

const STORAGE_KEYS = {
  configs: "cloudmail.api.configs",
  activeConfigId: "cloudmail.api.activeConfigId",
  configPanelCollapsed: "cloudmail.api.configPanelCollapsed",
};

function createConfigId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `config-${Date.now()}`;
}

function sanitizeConfigs(configs: unknown): ApiConfig[] {
  if (!Array.isArray(configs)) {
    return [];
  }

  const sanitized = configs
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const candidate = item as Partial<ApiConfig>;
      return {
        id: typeof candidate.id === "string" && candidate.id ? candidate.id : createConfigId(),
        name:
          typeof candidate.name === "string" && candidate.name.trim()
            ? candidate.name
            : `配置 ${index + 1}`,
        domain: typeof candidate.domain === "string" ? candidate.domain : "",
        token: typeof candidate.token === "string" ? candidate.token : "",
        emailDomain: typeof candidate.emailDomain === "string" ? candidate.emailDomain : "",
      };
    })
    .filter((item): item is ApiConfig => item !== null);

  return sanitized;
}

function loadInitialConfigs(): ApiConfig[] {
  try {
    return sanitizeConfigs(JSON.parse(localStorage.getItem(STORAGE_KEYS.configs) || "null"));
  } catch {
    return [];
  }
}

function loadInitialActiveConfigId(configs: ApiConfig[]): string {
  const savedId = localStorage.getItem(STORAGE_KEYS.activeConfigId);
  if (savedId && configs.some((config) => config.id === savedId)) {
    return savedId;
  }

  return configs[0]?.id || "";
}

function loadInitialConfigPanelCollapsed(): boolean {
  return localStorage.getItem(STORAGE_KEYS.configPanelCollapsed) === "true";
}

function findEmailInText(value: string): string | null {
  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : null;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  );
}

function getParsedEmailDomainFromApiDomain(domain?: string): string {
  if (!domain) {
    return "";
  }

  try {
    const url = new URL(domain.startsWith("http") ? domain : `https://${domain}`);
    // Remove 'mail.' prefix if it exists, as often the email domain is just the base domain
    return url.hostname.replace(/^mail\./, "");
  } catch {
    return "";
  }
}

function getEffectiveEmailDomain(config?: ApiConfig): string {
  if (!config) {
    return "";
  }

  if (config.emailDomain && config.emailDomain.trim()) {
    return config.emailDomain.trim().replace(/^@/, "");
  }

  return getParsedEmailDomainFromApiDomain(config.domain);
}

function parseImportedConfigs(payload: unknown): ApiConfig[] {
  if (Array.isArray(payload)) {
    return sanitizeConfigs(payload);
  }

  if (payload && typeof payload === "object" && Array.isArray((payload as { configs?: unknown }).configs)) {
    return sanitizeConfigs((payload as { configs: unknown[] }).configs);
  }

  return [];
}


function App() {
  const initialConfigs = loadInitialConfigs();
  const [apiConfigs, setApiConfigs] = useState<ApiConfig[]>(() => initialConfigs);
  const [activeConfigId, setActiveConfigId] = useState<string>(() =>
    loadInitialActiveConfigId(initialConfigs),
  );
  const [isConfigPanelCollapsed, setIsConfigPanelCollapsed] = useState<boolean>(() =>
    loadInitialConfigPanelCollapsed(),
  );
  const [activeTab, setActiveTab] = useState<"fetch" | "add">("fetch");
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const configImportInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch Email State
  const [toEmail, setToEmail] = useState("");
  const [emails, setEmails] = useState<Email[]>([]);
  const [fetchStatus, setFetchStatus] = useState("");
  const [isLoadingFetch, setIsLoadingFetch] = useState(false);

  // Add User State
  const [accountCount, setAccountCount] = useState<number>(10);
  const [usernameLength, setUsernameLength] = useState<number>(8);
  const [parsedUsers, setParsedUsers] = useState<User[]>([]);
  const [addUserStatus, setAddUserStatus] = useState("");
  const [isAddingUsers, setIsAddingUsers] = useState(false);

  const activeConfig = useMemo(
    () => apiConfigs.find((config) => config.id === activeConfigId) || apiConfigs[0],
    [activeConfigId, apiConfigs],
  );
  const effectiveEmailDomain = getEffectiveEmailDomain(activeConfig);
  const parsedEmailDomainFromApi = getParsedEmailDomainFromApiDomain(activeConfig?.domain);

  useEffect(() => {
    if (!activeConfig && apiConfigs.length > 0) {
      setActiveConfigId(apiConfigs[0].id);
    }
  }, [activeConfig, apiConfigs]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.configs, JSON.stringify(apiConfigs));
  }, [apiConfigs]);

  useEffect(() => {
    if (activeConfigId) {
      localStorage.setItem(STORAGE_KEYS.activeConfigId, activeConfigId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.activeConfigId);
    }
  }, [activeConfigId]);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEYS.configPanelCollapsed,
      String(isConfigPanelCollapsed),
    );
  }, [isConfigPanelCollapsed]);

  useEffect(() => {
    // Check for email in URL path
    let path = window.location.pathname;
    // Remove leading and trailing slashes
    path = path.replace(/^\/+|\/+$/g, "");

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
    if (decodedPath && decodedPath.length > 3 && decodedPath.includes("@")) {
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

  useEffect(() => {
    function handleGlobalPaste(event: ClipboardEvent) {
      const activeElement = document.activeElement;
      const isEmailInputFocused = emailInputRef.current === activeElement;
      if (isEditableTarget(event.target) || isEditableTarget(activeElement) || isEmailInputFocused) {
        return;
      }

      const clipboardText = event.clipboardData?.getData("text") || "";
      const pastedEmail = findEmailInText(clipboardText);
      if (!pastedEmail) {
        return;
      }

      setActiveTab("fetch");
      setToEmail(pastedEmail);
      setFetchStatus(`已从剪贴板识别邮箱 ${pastedEmail}`);

      window.setTimeout(() => {
        emailInputRef.current?.focus();
        emailInputRef.current?.select();
      }, 0);
    }

    window.addEventListener("paste", handleGlobalPaste);
    return () => window.removeEventListener("paste", handleGlobalPaste);
  }, []);

  function updateConfig(configId: string, patch: Partial<ApiConfig>) {
    setApiConfigs((currentConfigs) =>
      currentConfigs.map((config) =>
        config.id === configId ? { ...config, ...patch } : config,
      ),
    );
  }

  function handleExportConfigs() {
    if (apiConfigs.length === 0) {
      setFetchStatus("当前没有可导出的接口配置。");
      return;
    }

    const content = JSON.stringify(apiConfigs, null, 2);
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cloudmail-configs-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setFetchStatus(`已导出 ${apiConfigs.length} 个接口配置。`);
  }

  function handleImportConfigsClick() {
    configImportInputRef.current?.click();
  }

  async function handleImportConfigs(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const importedConfigs = parseImportedConfigs(JSON.parse(text));
      if (importedConfigs.length === 0) {
        setFetchStatus("导入失败：文件中没有有效的接口配置。");
        return;
      }

      const shouldReplace = window.confirm(`确认导入并覆盖当前本地配置吗？共 ${importedConfigs.length} 条。`);
      if (!shouldReplace) {
        return;
      }

      setApiConfigs(importedConfigs);
      setActiveConfigId(importedConfigs[0]?.id || "");
      setFetchStatus(`已成功导入 ${importedConfigs.length} 个接口配置。`);
    } catch (error) {
      console.error(error);
      setFetchStatus("导入失败：请选择有效的 JSON 配置文件。");
    } finally {
      if (configImportInputRef.current) {
        configImportInputRef.current.value = "";
      }
    }
  }

  function addConfig() {
    const shouldCreate = window.confirm("确认新增一个空白配置吗？");
    if (!shouldCreate) {
      return;
    }

    const nextIndex = apiConfigs.length + 1;
    const newConfig: ApiConfig = {
      id: createConfigId(),
      name: `配置 ${nextIndex}`,
      domain: "",
      token: "",
      emailDomain: "",
    };

    setApiConfigs((currentConfigs) => [...currentConfigs, newConfig]);
    setActiveConfigId(newConfig.id);
  }

  function removeActiveConfig() {
    if (!activeConfig) {
      return;
    }

    const shouldDelete = window.confirm(`确认删除当前配置“${activeConfig.name}”吗？`);
    if (!shouldDelete) {
      return;
    }

    if (apiConfigs.length === 1) {
      setApiConfigs([]);
      setActiveConfigId("");
      setFetchStatus("当前配置已删除，请按需新建配置。");
      return;
    }

    const nextConfigs = apiConfigs.filter((config) => config.id !== activeConfig.id);
    setApiConfigs(nextConfigs);
    setActiveConfigId(nextConfigs[0].id);
  }

  async function fetchEmails(emailToFetch?: string | unknown) {
    const targetEmail = typeof emailToFetch === "string" ? emailToFetch : toEmail;

    if (!targetEmail) {
      setFetchStatus("请输入邮箱地址。");
      return;
    }

    if (!activeConfig) {
      setFetchStatus("请先配置接口域名和 Token。");
      return;
    }

    setFetchStatus("获取中...");
    setIsLoadingFetch(true);
    try {
      const result = await mailService.fetchEmails(targetEmail, activeConfig);
      setEmails(result);
      setFetchStatus(`配置 ${activeConfig.name} 查询成功，找到 ${result.length} 封邮件。`);
    } catch (error) {
      console.error(error);
      setFetchStatus(`错误: ${error}`);
    } finally {
      setIsLoadingFetch(false);
    }
  }

  function handleEmailInputPaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const clipboardText = event.clipboardData.getData("text") || "";
    const pastedEmail = findEmailInText(clipboardText);
    if (!pastedEmail) {
      return;
    }

    event.preventDefault();
    setToEmail(pastedEmail);
    setFetchStatus(`已从输入框粘贴邮箱 ${pastedEmail}`);

    window.setTimeout(() => {
      emailInputRef.current?.focus();
      emailInputRef.current?.select();
    }, 0);
  }

  function generateRandomString(length: number) {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ2345689";
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

    if (usernameLength < 8 || usernameLength > 13) {
      setAddUserStatus("账号长度只能设置为 8 到 13 位。");
      return;
    }

    if (!effectiveEmailDomain) {
      setAddUserStatus("请先配置接口域名或手动填写生成域名。");
      return;
    }

    const users: User[] = [];
    for (let i = 0; i < accountCount; i++) {
      const username = generateRandomString(usernameLength);
      users.push({
        email: `${username}@${effectiveEmailDomain}`,
        password: generatePassword(),
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
    const content = parsedUsers.map((u) => `${u.email}----${u.password}`).join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `users_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function addUsers() {
    if (parsedUsers.length === 0) {
      setAddUserStatus("请先生成账号。");
      return;
    }

    if (!activeConfig) {
      setAddUserStatus("请先配置接口域名和 Token。");
      return;
    }

    setAddUserStatus("正在添加用户...");
    setIsAddingUsers(true);
    try {
      await mailService.addUsers(parsedUsers, activeConfig);
      setAddUserStatus(`配置 ${activeConfig.name} 提交成功，用户添加成功！`);
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
        <div>
          <h1>CloudMail Manager</h1>
          <p className="header-subtitle">纯 Web 版，支持多域名和多 Token 快速切换。</p>
        </div>
        <div className="config-badge">
          当前配置:
          <strong>{activeConfig?.name || "未选择"}</strong>
        </div>
      </header>

      <main className="main-content">
        <section className="card config-card fade-in">
          <div className="card-header config-card-header">
            <div>
              <h2>接口配置</h2>
              <p className="subtitle">请求体格式保持不变，只切换当前使用的域名和 Token。</p>
            </div>
            <button
              type="button"
              className="secondary-btn config-toggle-btn"
              onClick={() => setIsConfigPanelCollapsed((current) => !current)}
            >
              {isConfigPanelCollapsed ? "显示配置" : "隐藏配置"}
            </button>
          </div>

          {!isConfigPanelCollapsed ? (
            <>
              <div className="config-toolbar">
                <select
                  className="config-select"
                  value={activeConfig?.id || ""}
                  onChange={(e) => setActiveConfigId(e.target.value)}
                  disabled={apiConfigs.length === 0}
                >
                  {apiConfigs.map((config) => (
                    <option key={config.id} value={config.id}>
                      {config.name}
                    </option>
                  ))}
                </select>
                <button className="secondary-btn" onClick={addConfig}>
                  新增配置
                </button>
                <button className="secondary-btn" onClick={removeActiveConfig}>
                  删除当前
                </button>
                <button
                  className="secondary-btn"
                  onClick={handleExportConfigs}
                  disabled={apiConfigs.length === 0}
                >
                  导出配置
                </button>
                <button className="secondary-btn" onClick={handleImportConfigsClick}>
                  导入配置
                </button>
                <input
                  ref={configImportInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImportConfigs}
                  style={{ display: "none" }}
                />
              </div>

              {activeConfig ? (
                <div className="config-grid">
                  <label className="field-group">
                    <span>配置名称</span>
                    <input
                      type="text"
                      value={activeConfig.name}
                      onChange={(e) => updateConfig(activeConfig.id, { name: e.target.value })}
                      placeholder="例如：主站"
                    />
                  </label>
                  <label className="field-group field-wide">
                    <span>接口域名</span>
                    <input
                      type="text"
                      value={activeConfig.domain}
                      onChange={(e) => updateConfig(activeConfig.id, { domain: e.target.value })}
                      placeholder="https://mail.xxxx.com 或 https://mail.xxxx.com/api/public"
                    />
                  </label>
                  <label className="field-group field-wide">
                    <span>Token</span>
                    <input
                      type="text"
                      value={activeConfig.token}
                      onChange={(e) => updateConfig(activeConfig.id, { token: e.target.value })}
                      placeholder="输入当前配置对应的 Token"
                    />
                  </label>
                  <label className="field-group field-wide">
                    <span>生成域名 (可选)</span>
                    <input
                      type="text"
                      value={activeConfig.emailDomain || parsedEmailDomainFromApi}
                      onChange={(e) => updateConfig(activeConfig.id, { emailDomain: e.target.value })}
                      placeholder="会跟随接口域名自动解析"
                    />
                  </label>
                </div>
              ) : (
                <div className="config-empty-state">暂无接口配置，请先点击“新增配置”。</div>
              )}
            </>
          ) : (
            activeConfig ? (
              <div className="config-collapsed-summary">
                  <span>当前配置: {activeConfig.name}</span>
                  <span>域名: {activeConfig.domain || "未填写"}</span>
                  <span>Token: {activeConfig.token ? "已填写" : "未填写"}</span>
                  <span>生成后缀: {effectiveEmailDomain ? `@${effectiveEmailDomain}` : "未配置"}</span>
                </div>
            ) : (
              <div className="config-collapsed-summary">
                <span>当前没有本地缓存的接口配置</span>
              </div>
            )
          )}
        </section>

        <div className="tabs">
          <button
            className={`tab-btn ${activeTab === "fetch" ? "active" : ""}`}
            onClick={() => setActiveTab("fetch")}
          >
            邮件查询
          </button>
          <button
            className={`tab-btn ${activeTab === "add" ? "active" : ""}`}
            onClick={() => setActiveTab("add")}
          >
            批量添加用户
          </button>
        </div>

        <div className="tab-content">
          {activeTab === "fetch" && (
            <div className="card fade-in">
              <div className="card-header">
                <h2>查询收件箱</h2>
                <p className="subtitle">输入邮箱地址查看最新邮件</p>
              </div>
              <div className="search-container">
                <div className="search-panel">
                  <div className="search-bar">
                    <input
                      ref={emailInputRef}
                      type="email"
                      placeholder={
                        effectiveEmailDomain
                          ? `例如: test@${effectiveEmailDomain}`
                          : "请先配置接口域名或生成域名"
                      }
                      value={toEmail}
                      onChange={(e) => setToEmail(e.target.value)}
                      onPaste={handleEmailInputPaste}
                      onKeyDown={(e) => e.key === "Enter" && fetchEmails()}
                    />
                    <button className="primary-btn" onClick={() => fetchEmails()} disabled={isLoadingFetch}>
                      {isLoadingFetch ? "查询中..." : "查询"}
                    </button>
                  </div>
                  {fetchStatus && (
                    <div className={`status-msg ${fetchStatus.includes("错误") ? "error" : "info"}`}>
                      {fetchStatus}
                    </div>
                  )}
                </div>

                {toEmail && (
                  <div className="qrcode-wrapper">
                    <QRCodeSVG value={toEmail} size={100} level="M" />
                  </div>
                )}
              </div>

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
                        <span className="value">
                          {email.sendName} &lt;{email.sendEmail}&gt;
                        </span>
                      </div>
                      <div className="email-row">
                        <span className="label">收件人:</span>
                        <span className="value">
                          {email.toName} &lt;{email.toEmail}&gt;
                        </span>
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

          {activeTab === "add" && (
            <div className="card fade-in">
              <div className="card-header">
                <h2>批量添加用户</h2>
                <p className="subtitle">
                  {effectiveEmailDomain
                    ? `输入生成的账号数量，自动生成 @${effectiveEmailDomain} 邮箱；账号为 8-13 位全大写并排除易混淆字符`
                    : "请先配置接口域名或手动填写生成域名后再生成账号"}
                </p>
              </div>

              <div className="bulk-actions">
                <div className="input-group">
                  <label htmlFor="account-count">生成数量:</label>
                  <input
                    id="account-count"
                    type="number"
                    className="bulk-input"
                    placeholder="输入数量"
                    value={accountCount}
                    onChange={(e) => setAccountCount(parseInt(e.target.value, 10) || 0)}
                    min="1"
                  />
                </div>
                <div className="input-group">
                  <label htmlFor="username-length">账号位数:</label>
                  <select
                    id="username-length"
                    className="bulk-input"
                    value={usernameLength}
                    onChange={(e) => setUsernameLength(parseInt(e.target.value, 10))}
                  >
                    {[8, 9, 10, 11, 12, 13].map((length) => (
                      <option key={length} value={length}>
                        {length} 位
                      </option>
                    ))}
                  </select>
                </div>
                <div className="action-buttons">
                  <button
                    className="secondary-btn"
                    onClick={handleGenerateAccounts}
                    disabled={!effectiveEmailDomain}
                  >
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
                    {isAddingUsers ? "添加中..." : "3. 提交添加"}
                  </button>
                </div>
              </div>

              {addUserStatus && (
                <div className={`status-msg ${addUserStatus.includes("错误") ? "error" : "success"}`}>
                  {addUserStatus}
                </div>
              )}

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
