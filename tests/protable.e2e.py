# -*- coding: utf-8 -*-
"""ProTable end-to-end acceptance: columns, search form, pagination, toolbar.
Drives the designer UI, then runs a real independent build and inspects the
built artifact inside the iframe. Writes evidence/protable-e2e.json + screenshots.
"""
import asyncio, json
from playwright.async_api import async_playwright

EV = "E:/ai/antd-studio/evidence"
BASE = "http://127.0.0.1:5173"
R = {}

async def monaco_value(page):
    return await page.evaluate("() => { const m = window.monaco.editor.getModels(); return m.length ? m[0].getValue() : ''; }")

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1700, "height": 980})
        page_errors = []
        page.on("pageerror", lambda e: page_errors.append(str(e)[:200]))

        await page.goto(BASE + "/", wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(2000)

        # ---------- 1. select ProTable ----------
        await page.locator("[data-node-id='user-table']").first.click(force=True)
        await page.wait_for_timeout(500)
        R["1_protable_selected"] = await page.locator(".canvas-node--selected[data-node-id='user-table']").count()
        R["1_props_panel"] = await page.locator(".selected-component__name").inner_text()

        # ---------- 2. columns: read current, add a column via JSON editor ----------
        cols_field = page.locator(".prop-field").filter(has=page.locator("code:text-is('columns')")).locator("textarea").first
        R["2_columns_editor_present"] = await cols_field.count() > 0
        new_cols = json.dumps([
            {"title": "用户名称", "dataIndex": "name"},
            {"title": "手机号", "dataIndex": "phone"},
            {"title": "状态", "dataIndex": "status"},
            {"title": "邮箱", "dataIndex": "email"},
        ], ensure_ascii=False)
        await cols_field.fill(new_cols)
        await page.wait_for_timeout(1000)
        # canvas ProTable should now render 4 column headers
        headers = await page.locator("[data-node-id='user-table'] th").all_inner_texts()
        R["2_canvas_headers"] = [h.strip() for h in headers if h.strip()]
        R["2_email_column_added"] = any("邮箱" in h for h in headers)
        await page.screenshot(path=f"{EV}/protable-01-columns.png")

        # ---------- 3. search: toggle on ----------
        search_switch = page.locator(".prop-field").filter(has=page.locator("code:text-is('search')")).locator(".ant-switch").first
        await search_switch.click()
        await page.wait_for_timeout(1200)
        R["3_search_form_visible"] = await page.locator("[data-node-id='user-table'] .ant-pro-table-search").count()
        await page.screenshot(path=f"{EV}/protable-02-search.png")

        # ---------- 4. toolbar options: toggle on ----------
        options_switch = page.locator(".prop-field").filter(has=page.locator("code:text-is('options')")).locator(".ant-switch").first
        await options_switch.click()
        await page.wait_for_timeout(1200)
        R["4_toolbar_visible"] = await page.locator("[data-node-id='user-table'] .ant-pro-table-list-toolbar").count()
        await page.screenshot(path=f"{EV}/protable-03-toolbar.png")

        # ---------- 5. pagination: set pageSize via JSON ----------
        pag_field = page.locator(".prop-field").filter(has=page.locator("code:text-is('pagination')")).locator("textarea").first
        R["5_pagination_editor_present"] = await pag_field.count() > 0
        await pag_field.fill(json.dumps({"pageSize": 2, "showSizeChanger": True}))
        await page.wait_for_timeout(1200)
        # dataSource has 3 rows; pageSize 2 => pagination shows and page 2 has 1 row
        pag_txt = await page.locator("[data-node-id='user-table'] .ant-pagination").inner_text()
        R["5_pagination_text"] = pag_txt.strip().replace("\n", " ")[:80]
        R["5_pagination_active"] = "1" in pag_txt and "2" in pag_txt
        await page.screenshot(path=f"{EV}/protable-04-pagination.png")

        # ---------- 6. code sync: TSX reflects all edits ----------
        await page.locator(".ant-tabs-tab").filter(has_text="TSX").first.click()
        await page.wait_for_timeout(2500)
        await page.wait_for_function("() => window.monaco && window.monaco.editor.getModels().length > 0", timeout=60000)
        code = await monaco_value(page)
        R["6_code_has_email"] = "email" in code
        # search/options: official type is `false | Config`, so the generator
        # normalizes the IR boolean `true` to `{}` -> TSX `search={{}}`.
        R["6_code_has_search_on"] = "search={{}}" in code
        R["6_code_has_pagination"] = "pagination" in code and "pageSize" in code
        R["6_code_has_options_on"] = "options={{}}" in code
        R["6_code_no_invalid_true"] = "search={true}" not in code and '"search":true' not in code

        # ---------- 7. real independent build + iframe render ----------
        await page.locator(".ant-tabs-tab").filter(has_text="设计画布").first.click()
        await page.wait_for_timeout(500)
        await page.locator("button").filter(has_text="构建预览").first.click()
        try:
            await page.wait_for_selector(".ant-drawer-open iframe", timeout=120000)
            frame = page.frame_locator(".ant-drawer-open iframe")
            await asyncio.sleep(2.5)
            R["7_iframe_toolbar"] = await frame.locator(".ant-pro-table-list-toolbar").count()
            R["7_iframe_search"] = await frame.locator(".ant-pro-table-search").count()
            R["7_iframe_email_header"] = await frame.locator("th:has-text('邮箱')").count()
            R["7_iframe_pagination"] = await frame.locator(".ant-pagination").count()
            # click page 2 in built preview -> 1 row
            await frame.locator(".ant-pagination-item-2").click(timeout=15000)
            await asyncio.sleep(1)
            R["7_iframe_page2_rows"] = await frame.locator(".ant-table-tbody tr").count()
            log_txt = await page.locator(".preview-toolbar").inner_text()
            R["7_build_log"] = log_txt.strip().replace("\n", " ")[:80]
            await page.screenshot(path=f"{EV}/protable-05-built-preview.png")
        except Exception as e:
            R["7_error"] = str(e)[:300]
            await page.screenshot(path=f"{EV}/protable-05-fail.png")

        R["page_errors"] = page_errors[:5]
        with open(f"{EV}/protable-e2e.json", "w", encoding="utf-8") as f:
            json.dump(R, f, ensure_ascii=False, indent=1)
        await browser.close()

asyncio.run(main())
