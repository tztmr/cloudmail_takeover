import { describe, expect, it } from "vitest";
import {
  isBulkAddPasswordVerified,
  validateBulkAddPassword,
} from "../src/utils/bulkAddGuard";

describe("validateBulkAddPassword", () => {
  it("rejects empty input", () => {
    expect(validateBulkAddPassword("")).toBe("请输入批量添加密码。");
    expect(validateBulkAddPassword(null)).toBe("已取消批量添加。");
  });

  it("rejects incorrect password", () => {
    expect(validateBulkAddPassword("wrong-password")).toBe("批量添加密码错误，无法继续提交。");
  });

  it("accepts the required password", () => {
    expect(validateBulkAddPassword("dx888")).toBeNull();
  });

  it("reports verification status directly from the input", () => {
    expect(isBulkAddPasswordVerified("dx888")).toBe(true);
    expect(isBulkAddPasswordVerified(" dx888 ")).toBe(true);
    expect(isBulkAddPasswordVerified("dx8888")).toBe(false);
  });
});
