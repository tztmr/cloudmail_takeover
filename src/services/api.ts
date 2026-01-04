import { invoke } from "@tauri-apps/api/core";

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

const isTauri = () => {
    // @ts-ignore
    return !!window.__TAURI_INTERNALS__;
};

const API_BASE_URL = "/api-proxy";
const AUTH_TOKEN = "8d66ef93-beef-42da-baa3-2d655dd9b51d";

export const mailService = {
  fetchEmails: async (toEmail: string, token: string = AUTH_TOKEN): Promise<Email[]> => {
    if (isTauri()) {
      return await invoke<Email[]>("fetch_emails", { toEmail });
    } else {
      const response = await fetch(`${API_BASE_URL}/emailList`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": token,
        },
        body: JSON.stringify({ toEmail }),
      });
      const data = await response.json();
      if (data.code === 200) {
        return data.data || [];
      } else {
        throw new Error(data.message || "Failed to fetch emails");
      }
    }
  },

  addUsers: async (users: User[], token: string = AUTH_TOKEN): Promise<void> => {
    if (isTauri()) {
      await invoke("add_users", {
        users: users,
      });
    } else {
      const requestBody = { list: users };
      console.log("Adding users with body:", JSON.stringify(requestBody, null, 2));
      
      const response = await fetch(`${API_BASE_URL}/addUser`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": token,
        },
        body: JSON.stringify(requestBody),
      });
      const data = await response.json();
      if (data.code !== 200) {
        throw new Error(data.message || "Failed to add users");
      }
    }
  },
};
