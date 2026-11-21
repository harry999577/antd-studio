# -*- coding: utf-8 -*-
import json

def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)

s = load("E:/ai/antd-studio/evidence/e2e-results.json")
p = load("E:/ai/antd-studio/evidence/protable-e2e.json")

out = {}
# smoke: all boolean flags must be True; counts positive
sb = {k: v for k, v in s.items() if isinstance(v, bool)}
out["smoke_bool_flags_all_true"] = all(sb.values())
out["smoke_F_pass"] = s["F_pass"]
out["smoke_page_errors"] = len(s["page_errors"])
# protable: booleans true, counts >= 1
pb = {k: v for k, v in p.items() if isinstance(v, bool)}
out["protable_bool_flags_all_true"] = all(pb.values())
pc = {k: v for k, v in p.items() if isinstance(v, int)}
out["protable_counts_all_positive"] = all(v >= 1 for v in pc.values())
out["protable_page_errors"] = len(p["page_errors"])
out["protable_build_log"] = p["7_build_log"]

with open("E:/ai/antd-studio/evidence/final-check.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print(json.dumps(out, ensure_ascii=True, indent=1))
