---
title: Scanning receipts
description: Scan, photograph, or attach receipts and let HSA Monster fill in the details.
sidebar:
  order: 2
---
## Adding a receipt

Tap <span class="help-icon help-icon--plus" role="img" aria-label="Add"></span> on **Summary** or **Expenses** and choose:

| Option | Best for |
| --- | --- |
| **Scan Document** | Paper receipts. The camera finds the edges and straightens the page. Scan several pages and they're saved as one PDF. |
| **Attach Photo** | A photo or screenshot already in your library. |
| **Attach File** | PDFs and images in Files, like an EOB or a bill from a patient portal. |

HSA Monster reads the receipt and fills in the **provider**, **date**, **amount**, **description**, and **patient**. Nothing is saved until you check the details and tap **Save**.

Receipts can be PDF, JPEG, PNG, HEIC, GIF, or WebP, up to 5 MB. Photos are compressed automatically.

## How well it read the receipt

With Apple Intelligence, a banner at the top of the form shows **High**, **Medium**, or **Low confidence** and a short note on what to double-check.

**Medium** often means the receipt mixes HSA-eligible and other items, like a pharmacy receipt that includes non-medical items. Make sure the amount only covers the eligible items.

## Choosing how receipts are read

Go to **Settings → Document Scanning**:

| Option | How it works |
| --- | --- |
| **Text Recognition** | Reads the text and looks for familiar receipt patterns. Works on every device, but less accurate. |
| **Apple Intelligence** | An on-device model that understands the receipt. Nothing leaves your device. The default where available. |
| **Private Cloud Compute** | A larger model that can pick out individual HSA-eligible items and subtotals. Most accurate. The receipt is processed by Apple's privacy-focused Private Cloud Compute. |

Options your device can't use are dimmed with the reason, like **Turn on Apple Intelligence in iOS Settings**.

## Adding a receipt later

Expenses without a receipt show **Missing**. To add one, swipe right on the expense and tap **Add Receipt**, or edit it and tap **Missing** next to **Document**.

## Viewing a receipt

Tap the receipt thumbnail on an expense. Pinch or double-tap to zoom, and tap **Share** to send or save it. When an expense has more than one document, the viewer steps through them all.

To replace a receipt, edit the expense, use the menu on the receipt and choose **Remove Receipt**, then add the new one.

## More than one document

An EOB or a statement that arrives later can go on the same expense as the receipt. See [Adding more than one document](/help/expenses/multiple-documents/).

## Where receipts are stored

Receipts are saved inside HSA Monster and synced with your private iCloud, so they're backed up and available on every device. To get copies, [export a receipts ZIP](/help/data/reports-and-export/). Every receipt is given a clean filename with date, provider, and amount, making them easier than ever to retain. An expense with several documents shares one name, numbered in the order you attached them.
