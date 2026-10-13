---
title: Importing transactions
description: Bring in expenses and contributions from a spreadsheet or your HSA provider.
sidebar:
  order: 3
---
Moving from a spreadsheet or another app? Import your history instead of typing it in.

## Importing a file

1. Go to **Settings → Import Data** (Mac: **⌘ I**).
2. Tap **Select File** and choose a **CSV**, **OFX / QFX**, or **QIF** file.
3. Review the transactions. Uncheck any you don't want, and set the type for each, or all at once with **Set All Types**.
4. Tap **Import**.

## Preparing a CSV

Tap **Template** for a sample file. Columns can be in any order:

| Column | Notes |
| --- | --- |
| **Date** | Required. Like 2026-03-15 or 03/15/2026. |
| **Amount** | Required. Dollar signs are fine. |
| **Provider** | Also read from Payee or Merchant. |
| **Description** | Also read from Memo. |
| **Account** | Must match an HSA account's name or number. |
| **Patient** | Must match a family member's name. |
| **Type** | Expense, Contribution, Reimbursement, or Adjustment. |

Without a **Type**, negative amounts become expenses and positive amounts become contributions.

:::caution
Don't use commas inside any field, like "Smith, MD." Remove them before importing.
:::

## After importing

Imported expenses are marked **Out of Pocket** with a receipt status of **Missing**. Attach receipts as you find them, or [update several at once](/help/expenses/search-and-batch-edit/).

## Adding a single receipt file

To turn one PDF or image into an expense, use **+ → Attach File** or the [share sheet](/help/expenses/shortcuts/) instead.
