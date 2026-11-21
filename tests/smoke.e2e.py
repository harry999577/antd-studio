# -*- coding: utf-8 -*-
"""E2E smoke test for antd-studio designer. Evidence for objective sections D/E/F.
Editor is driven through window.monaco model API (programmatic setValue fires the
library onChange handler, identical to user typing at the React-state level)."""
import asyncio, json
from playwright.async_api import async_playwright

EV = "E:/ai/antd-studio/evidence"
BASE = "http://127.0.0.1:5173"
R = {}

JS_GET_VALUE = "() => { const m = window.monaco.editor.getModels(); return m.length ? m[0].getValue() : ''; }"
JS_SET_VALUE = "(t) => { const m = window.monaco.editor.getModels(); if (m.length) m[0].setValue(t); }"

async def wait_monaco(page):
    await page.wait_for_function("() => window.monaco && window.monaco.editor.getModels().length > 0", timeout=60000)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1600, "height": 950})
        page_errors = []
        page.on("pageerror", lambda e: page_errors.append(str(e)[:200]))

        # ---------- A. designer loads, real antd components render ----------
        await page.goto(BASE + "/", wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(2000)
        R["A_real_ant_btn"] = await page.locator("button.ant-btn").count()
        R["A_real_protable"] = await page.locator(".ant-pro-table").count()
        R["A_real_input"] = await page.locator("input.ant-input").count()
        R["A_canvas_nodes"] = await page.locator(".canvas-node").count()
        R["A_palette_items"] = await page.locator(".palette-item").count()
        await page.screenshot(path=f"{EV}/evidence-01-designer.png")

        # ---------- B. select -> props panel linkage ----------
        await page.locator("[data-node-id='search-submit']").first.click(force=True)
        await page.wait_for_timeout(400)
        R["B_selected_node"] = await page.locator(".canvas-node--selected").count()
        R["B_props_fields"] = await page.locator(".props-form .prop-field").count()
        R["B_node_id"] = await page.locator(".node-meta").count()
        await page.screenshot(path=f"{EV}/evidence-02-selected.png")

        # ---------- C. prop edit -> canvas + code both update ----------
        children_input = page.locator(".prop-field").filter(has_text="children").locator("input").last
        await children_input.fill("E2E-SYNC")
        await page.wait_for_timeout(700)
        R["C_canvas_updated"] = await page.locator("button:has-text('E2E-SYNC')").count()
        await page.locator(".ant-tabs-tab").filter(has_text="TSX").first.click()
        await page.wait_for_timeout(2500)
        await wait_monaco(page)
        code = await page.evaluate(JS_GET_VALUE)
        R["C_code_updated"] = "E2E-SYNC" in code
        await page.screenshot(path=f"{EV}/evidence-03-code.png")

        # ---------- D. broken code -> parse error, original source kept ----------
        await wait_monaco(page)
        await page.evaluate(JS_SET_VALUE, "export default function Bad( { return <div/>; }")
        await page.locator("button").filter(has_text="\u89e3\u6790\u5e76\u540c\u6b65\u753b\u5e03").first.click()
        await page.wait_for_timeout(900)
        R["D_error_shown"] = (await page.locator(".ant-alert").count()) > 0 or \
                             (await page.locator(".ant-message-error").count()) > 0
        after_d = await page.evaluate(JS_GET_VALUE)
        R["D_source_preserved"] = "Bad(" in after_d
        # canvas must be unchanged: the earlier E2E-SYNC document still in place
        await page.locator(".ant-tabs-tab").filter(has_text="\u8bbe\u8ba1\u753b\u5e03").first.click()
        await page.wait_for_timeout(600)
        R["D_canvas_untouched"] = await page.locator("button:has-text('E2E-SYNC')").count()
        await page.screenshot(path=f"{EV}/evidence-04-parse-error.png")

        # ---------- E. valid static JSX -> parses back into canvas ----------
        await page.locator(".ant-tabs-tab").filter(has_text="TSX").first.click()
        await page.wait_for_timeout(1500)
        await wait_monaco(page)
        rt_src = (
            "import { Flex, Button, ConfigProvider } from 'antd';\n\n"
            "export default function GeneratedPage() {\n"
            "  return (\n"
            "    <ConfigProvider theme={{ token: { colorPrimary: '#1677ff', borderRadius: 8 } }}>\n"
            "      <Flex gap={12}>\n"
            "        <Button type={'primary'}>ROUNDTRIP-OK</Button>\n"
            "      </Flex>\n"
            "    </ConfigProvider>\n"
            "  );\n"
            "}\n"
        )
        await page.evaluate(JS_SET_VALUE, rt_src)
        await page.locator("button").filter(has_text="\u89e3\u6790\u5e76\u540c\u6b65\u753b\u5e03").first.click()
        await page.wait_for_timeout(1000)
        toast_ok = (await page.locator(".ant-message-success").count()) > 0
        await page.locator(".ant-tabs-tab").filter(has_text="\u8bbe\u8ba1\u753b\u5e03").first.click()
        await page.wait_for_timeout(700)
        R["E_parse_success_toast"] = toast_ok
        R["E_canvas_roundtrip"] = await page.locator("button:has-text('ROUNDTRIP-OK')").count()
        R["E_old_doc_replaced"] = (await page.locator("button:has-text('E2E-SYNC')").count()) == 0
        await page.screenshot(path=f"{EV}/evidence-05-roundtrip.png")

        # ---------- F. 构建预览 through the app UI -> real vite build + iframe ----------
        build_btn = page.locator("button").filter(has_text="\u6784\u5efa\u9884\u89c8").first
        await build_btn.click()
        frame_ok = False
        try:
            await page.wait_for_selector(".ant-drawer-open iframe", timeout=120000)
            frame_locator = page.frame_locator(".ant-drawer-open iframe")
            await asyncio.sleep(2)
            btn_count = await frame_locator.locator("button.ant-btn").count()
            rt_count = await frame_locator.locator("text=ROUNDTRIP-OK").count()
            R["F_iframe_real_button"] = btn_count
            R["F_iframe_roundtrip"] = rt_count
            log_txt = await page.locator(".preview-toolbar").inner_text()
            R["F_build_log"] = log_txt.strip().replace("\n", " ")[:80]
            frame_ok = btn_count > 0 and rt_count > 0
            await page.screenshot(path=f"{EV}/evidence-06-preview-drawer.png")
        except Exception as e:
            R["F_error"] = str(e)[:250]
            if await page.locator(".ant-modal-content").count():
                R["F_modal_error"] = (await page.locator(".ant-modal-content").inner_text())[:300]
            await page.screenshot(path=f"{EV}/evidence-06-preview-fail.png")
        R["F_pass"] = frame_ok

        R["page_errors"] = page_errors[:5]
        with open(f"{EV}/e2e-results.json", "w", encoding="utf-8") as f:
            json.dump(R, f, ensure_ascii=False, indent=1)
        await browser.close()

asyncio.run(main())
