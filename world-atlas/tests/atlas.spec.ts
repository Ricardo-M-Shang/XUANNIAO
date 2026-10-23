import { test, expect } from "@playwright/test";

test("三界地理可以浏览，渲染无脚本错误", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByText("山川正在展开", { exact: true })).toBeHidden();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator(".place-label:visible")).toHaveCount(14);
  await page.getByRole("button", { name: "查看青牛村", exact: true }).click();
  await expect(
    page.getByRole("article", { name: "青牛村地理详情" }),
  ).toContainText("乡野聚落");
  await page.getByRole("button", { name: "关闭地点详情", exact: true }).click();
  await page.getByRole("button", { name: /02.*灵界/ }).click();
  await expect(page.locator(".place-label:visible")).toHaveCount(36);
  await page.getByRole("button", { name: "浏览洞天 01", exact: true }).click();
  await expect(page.getByRole("article")).toContainText("原稿未逐一命名");
  await page.getByRole("button", { name: /03.*仙界/ }).click();
  await expect(page.locator(".place-label:visible")).toHaveCount(6);
  await page.getByRole("button", { name: "查看照川仙城", exact: true }).click();
  await expect(page.getByRole("article")).toContainText("川下十三坊");
  expect(errors).toEqual([]);
});

test("搜索跨界定位，收藏在刷新后保留，URL 可以恢复地点", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: "搜索三界中的地点" }).fill("照川");
  await page.locator(".search-results .place-row").click();
  await expect(
    page.getByRole("article", { name: "照川仙城地理详情" }),
  ).toBeVisible();
  await expect(page.locator(".realm-nav button").nth(2)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "收藏照川仙城", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "取消收藏照川仙城", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("article", { name: "照川仙城地理详情" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "取消收藏照川仙城", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭地点详情", exact: true }).click();
  await page
    .locator(".directory-tabs")
    .getByRole("button", { name: /收藏/ })
    .click();
  await expect(page.locator(".sidebar .place-row")).toHaveCount(1);
  await page.locator(".sidebar .place-row").click();
  await expect(page.getByRole("article")).toContainText("照川仙城");
  await page
    .getByRole("button", { name: "取消收藏照川仙城", exact: true })
    .click();
  await expect(page.locator(".sidebar .place-row")).toHaveCount(0);
});

test("镜头、平移、图层、四海目录和说明面板均可操作", async ({ page }) => {
  // This scenario includes many WebGL redraws; the cloud browser uses SwiftShader.
  test.setTimeout(75_000);
  await page.goto("/");
  await expect(page.getByText("山川正在展开", { exact: true })).toBeHidden();
  await page.getByRole("button", { name: "放大地图", exact: true }).click();
  await expect(page.locator(".zoom-value")).not.toHaveText("100%");
  await page.getByRole("button", { name: "回到全图", exact: true }).click();
  await expect(page.locator(".zoom-value")).toHaveText("100%");
  await page.getByRole("button", { name: "俯瞰", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "俯瞰", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "2.5D", exact: true }).click();
  const pin = page.getByRole("button", { name: "查看青牛村", exact: true });
  const before = await pin.boundingBox();
  await page.mouse.move(1290, 760);
  await page.mouse.down();
  await page.mouse.move(1200, 790, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(async () => Math.abs((await pin.boundingBox())!.x - before!.x))
    .toBeGreaterThan(30);
  await page.getByRole("button", { name: "回到全图", exact: true }).click();
  await page.getByRole("button", { name: "图层", exact: true }).click();
  const markers = page.getByRole("button", { name: /地点标记/ });
  await markers.click();
  await expect(
    page.getByRole("button", { name: "查看青牛村", exact: true }),
  ).toBeHidden();
  await markers.click();
  await expect(
    page.getByRole("button", { name: "查看青牛村", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /地理联系/ }).click();
  await expect(page.getByRole("button", { name: /地理联系/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "关闭图层面板", exact: true }).click();
  await page.getByRole("button", { name: "四海", exact: true }).click();
  await page.locator(".region-row").filter({ hasText: "龙津海" }).click();
  await expect(page.locator(".region-info")).toContainText("精确方位");
  await page
    .getByRole("button", { name: "制图说明与操作帮助", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("不视为正史");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("移动端目录、搜索和地点详情可用", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "打开地域目录", exact: true }).click();
  await expect(page.locator(".sidebar")).toHaveClass(/mobile-open/);
  await page.getByRole("textbox", { name: "搜索三界中的地点" }).fill("蓬莱");
  await page.locator(".search-results .place-row").click();
  await expect(page.locator(".sidebar")).not.toHaveClass(/mobile-open/);
  await expect(
    page.getByRole("article", { name: "蓬莱地理详情" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "收藏蓬莱", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "取消收藏蓬莱", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
