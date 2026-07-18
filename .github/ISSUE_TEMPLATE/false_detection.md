---
name: False positive / false negative
about: The bot deleted a legitimate message, or missed a real scam
title: '[Detection] '
labels: false-positive
assignees: ''
---

**Type**

- [ ] False positive (legitimate message flagged/deleted)
- [ ] False negative (scam message missed)

**Message content**
The message text (redact anything sensitive) and whether it included an image.

**Detected triggers / AI reason**
If logged with `LOG_LEVEL=debug`, paste the `triggers` and/or AI `reason` output.

**Account context**
Approximate account age and whether the account had posted before.

**Expected outcome**
What should have happened instead.
