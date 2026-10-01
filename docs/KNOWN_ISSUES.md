# Known Issues, Risks & Technical Debt

| ID | Type | Description | Impact | Status |
|---|---|---|---|---|
| KI-001 | Repo | `Tayari Kakshya - LMS System.pdf` (51 MB) is committed on `main`; GitHub warns above 50 MB and every clone downloads it. | Slower clones | Open — owner decision (Q40). No history rewrite without approval. |
| KI-002 | Repo | `README.md` is UTF-16 encoded (created by PowerShell); renders oddly in some tools. | Cosmetic | Open — will rewrite as UTF-8 when scaffolding (Phase 3). |
| KI-003 | Product risk | App-store payment policies (Apple IAP; Google Play billing) may restrict selling digital courses through eSewa/Khalti/ConnectIPS inside the app. | Could block store approval or force a different purchase flow | Open — Q26; verify current policy before Phase 11. |
| KI-004 | Legal risk | Gorkhapatra content and official organisation emblems (Police/Army/APF/NID) may require permission to reproduce. | Takedown/legal exposure | Open — Q2, Q14. |
| KI-005 | Reference gaps | PDF lacks course detail, checkout, exam flow, results, quiz feedback, news detail, empty/error states; pages 20–22 are empty stubs. | Requires new design | Tracked in `PDF_UI_FEATURE_EXTRACTION.md §4`. |
| KI-006 | Reference copy | Copy errors in PDF: "Forget your password?", reset button labelled "Send email", "Sainey" spelling, duplicated tiles on p9. | Must not be copied | Note for design phase. |
| KI-007 | Environment | No Docker / PostgreSQL / pnpm on the dev machine. | Blocks Phase 4 local DB | Open — Q41. |
| KI-008 | Scale risk | Weekly exams cause synchronized load spikes. | Outage during exams | Design for it in Phase 3; load-test before launch. |
