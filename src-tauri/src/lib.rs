use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct Email {
    pub emailId: i32,
    pub sendEmail: String,
    pub sendName: String,
    pub subject: String,
    pub toEmail: String,
    pub toName: String,
    pub createTime: String,
    #[serde(rename = "type")]
    pub type_: i32,
    pub content: String,
    pub text: String,
    pub isDel: i32,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct EmailListResponse {
    pub code: i32,
    pub message: String,
    pub data: Option<Vec<Email>>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct User {
    pub email: String,
    pub password: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct AddUserResponse {
    pub code: i32,
    pub message: String,
    pub data: Option<serde_json::Value>,
}

#[tauri::command]
async fn fetch_emails(to_email: String) -> Result<Vec<Email>, String> {
    let client = reqwest::Client::new();
    let res = client.post("https://mail.tztright.top/api/public/emailList")
        .header("Authorization", "8d66ef93-beef-42da-baa3-2d655dd9b51d")
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "toEmail": to_email }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let response_body: EmailListResponse = res.json().await.map_err(|e| e.to_string())?;
    
    if response_body.code == 200 {
        Ok(response_body.data.unwrap_or_default())
    } else {
        Err(response_body.message)
    }
}

#[tauri::command]
async fn add_users(users: Vec<User>) -> Result<String, String> {
    let client = reqwest::Client::new();
    let res = client.post("https://mail.tztright.top/api/public/addUser")
        .header("Authorization", "8d66ef93-beef-42da-baa3-2d655dd9b51d")
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "list": users }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let response_body: AddUserResponse = res.json().await.map_err(|e| e.to_string())?;

    if response_body.code == 200 {
        Ok("Success".to_string())
    } else {
        Err(response_body.message)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![fetch_emails, add_users])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
