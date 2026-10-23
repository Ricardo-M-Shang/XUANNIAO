import { test, expect } from "@playwright/test";

test("地景细览、三种光照、环境暂停和建筑图层实际改变画面", async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(page.getByText("山川正在展开", { exact: true })).toBeHidden();
  await page.getByRole("button", { name: "暂停环境动态", exact: true }).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-motion", "false");
  await page
    .getByRole("button", { name: "细览青牛村景观", exact: true })
    .click();
  await expect(page.locator(".zoom-value")).toHaveText("380%");
  await expect(page.getByRole("article")).toContainText("田畴与水渠");
  await expect(page.getByRole("article")).toContainText("正在细览此处");
  const bounds = (await page.locator(".atlas-canvas").boundingBox())!;
  const clip = {
    x: bounds.x + bounds.width * 0.38,
    y: bounds.y + bounds.height * 0.4,
    width: bounds.width * 0.25,
    height: bounds.height * 0.27,
  };
  const capture = async () =>
    (await page.screenshot({ clip })).toString("base64");
  const day = await capture();
  await page.getByRole("button", { name: "夜间光照", exact: true }).click();
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-lighting",
    "night",
  );
  const night = await capture();
  const mean = async (image: string) =>
    page.evaluate(async (base64) => {
      const img = new Image();
      img.src = "data:image/png;base64," + base64;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let sum = 0;
      for (let i = 0; i < pixels.length; i += 4)
        sum +=
          pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722;
      return sum / (pixels.length / 4);
    }, image);
  expect((await mean(day)) - (await mean(night))).toBeGreaterThan(20);
  await page.getByRole("button", { name: "黄昏光照", exact: true }).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-lighting", "dusk");
  await page.getByRole("button", { name: "日间光照", exact: true }).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-lighting", "day");
  const built = await capture();
  await page.getByRole("button", { name: "城郭", exact: true }).click();
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-buildings",
    "false",
  );
  const empty = await capture();
  const changedFraction = await page.evaluate(
    async ([first, second]) => {
      const decode = async (base64: string) => {
        const img = new Image();
        img.src = "data:image/png;base64," + base64;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      };
      const a = await decode(first),
        b = await decode(second);
      let changed = 0;
      for (let i = 0; i < a.length; i += 4)
        if (
          Math.abs(a[i] - b[i]) +
            Math.abs(a[i + 1] - b[i + 1]) +
            Math.abs(a[i + 2] - b[i + 2]) >
          24
        )
          changed++;
      return changed / (a.length / 4);
    },
    [built, empty],
  );
  expect(changedFraction).toBeGreaterThan(0.01);
  await page.getByRole("button", { name: "城郭", exact: true }).click();
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-buildings",
    "true",
  );
  const before = await page.locator(".minimap-viewport").getAttribute("points");
  await page
    .getByRole("button", { name: "小地图导航，点击定位区域", exact: true })
    .click({ position: { x: 55, y: 55 } });
  await expect(page.getByRole("article")).toBeHidden();
  await expect(page.locator(".minimap-viewport")).not.toHaveAttribute(
    "points",
    before!,
  );
  expect(errors).toEqual([]);
});

test("手机可以进入景观细览，环境偏好与三界切换保持可用", async ({ page }) => {
  test.setTimeout(75_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#realm=human&place=qingniu");
  await expect(
    page.getByRole("article", { name: "青牛村地理详情" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "开启环境动态",
      exact: true,
      includeHidden: true,
    }),
  ).toBeAttached();
  await page
    .getByRole("button", { name: "走近此地 · 查看建筑与地形", exact: true })
    .click();
  await expect(page.locator(".zoom-value")).toHaveText("450%");
  await expect(
    page.getByRole("button", { name: "退出局部细览", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "夜间光照", exact: true }).click();
  await page
    .getByRole("navigation", { name: "选择世界层级" })
    .getByRole("button", { name: "灵界", exact: true })
    .click();
  await expect(page.locator(".place-label:visible")).toHaveCount(36);
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-lighting",
    "night",
  );
  await page.getByRole("button", { name: "打开地域目录", exact: true }).click();
  await page.getByRole("button", { name: "浏览洞天 03", exact: true }).click();
  await expect(page.getByRole("article")).toContainText("正史设定");
  await expect(page.getByRole("article")).toContainText("旧址石环");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
