const REQUIRED_BULK_ADD_PASSWORD = "dx888";

export function isBulkAddPasswordVerified(password: string): boolean {
  return password.trim() === REQUIRED_BULK_ADD_PASSWORD;
}

export function getBulkAddPasswordHint(isVerified: boolean): string {
  return isVerified ? "密码已自动验证，可直接提交。" : "输入验证密码后可提交添加。";
}

export function validateBulkAddPassword(password: string | null): string | null {
  if (password === null) {
    return "已取消批量添加。";
  }

  if (!password.trim()) {
    return "请输入批量添加密码。";
  }

  if (!isBulkAddPasswordVerified(password)) {
    return "批量添加密码错误，无法继续提交。";
  }

  return null;
}
