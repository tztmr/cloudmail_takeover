export interface Email {
  emailId: number;
  sendEmail: string;
  sendName: string;
  subject: string;
  toEmail: string;
  toName: string;
  createTime: string;
  type: number;
  content: string;
  text: string;
  isDel: number;
}

export interface User {
  email: string;
  password: string;
}

export interface ApiConfig {
  id: string;
  name: string;
  domain: string;
  token: string;
  emailDomain: string;
}

const API_PUBLIC_PATH = "/api/public";

function normalizeDomain(domain: string): string {
  const trimmed = domain.trim();
  if (!trimmed) {
    throw new Error("请输入接口域名。");
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

function buildApiBase(domain: string): string {
  const normalized = normalizeDomain(domain);
  return normalized.endsWith(API_PUBLIC_PATH)
    ? normalized
    : `${normalized}${API_PUBLIC_PATH}`;
}

async function requestApi<T>(
  path: string,
  body: unknown,
  config: ApiConfig,
): Promise<T> {
  const token = config.token.trim();
  if (!token) {
    throw new Error("请输入 Token。");
  }

  const response = await fetch(`${buildApiBase(config.domain)}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
    },
    body: JSON.stringify(body),
  });

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    throw new Error(`接口返回了无法解析的响应，状态码 ${response.status}。`);
  }

  const result = data as { code?: number; data?: T; message?: string };
  if (!response.ok) {
    throw new Error(result.message || `请求失败，状态码 ${response.status}。`);
  }

  if (result.code !== 200) {
    throw new Error(result.message || "接口请求失败。");
  }

  return result.data as T;
}

export const mailService = {
  fetchEmails: async (toEmail: string, config: ApiConfig): Promise<Email[]> => {
    const result = await requestApi<Email[]>("/emailList", { toEmail }, config);
    return result || [];
  },

  addUsers: async (users: User[], config: ApiConfig): Promise<void> => {
    const requestBody = { list: users };
    await requestApi("/addUser", requestBody, config);
  },
};
