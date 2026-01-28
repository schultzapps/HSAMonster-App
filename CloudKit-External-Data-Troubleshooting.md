# CloudKit External Binary Data Troubleshooting

## Issue Summary

During CloudKit zone sharing testing (January 2026), the receiving device logged multiple Core Data errors about failing to clone external data references. Despite these errors, receipt attachments displayed correctly on both devices.

## Error Pattern

```
CoreData: error: Failed to clone external data reference from
/private/var/mobile/Containers/Shared/AppGroup/.../HSA_Storage_Shared_SUPPORT/_EXTERNAL_DATA/<UUID>.interim
to /private/var/mobile/Containers/Data/Application/.../tmp/.LINKS/...
error: The file "<UUID>.interim" doesn't exist.
```

## Affected Configuration

- **Entity**: `Receipt`
- **Attribute**: `fileData` (Binary with `allowsExternalBinaryDataStorage="YES"`)
- **Context**: CloudKit zone sharing via `NSPersistentCloudKitContainer`

## Why This Happens

When Core Data's `allowsExternalBinaryDataStorage` is enabled:
1. Large binary data (>100KB typically) is stored as separate files in `_EXTERNAL_DATA/`
2. The database stores only a reference to the external file
3. During CloudKit sync, Core Data attempts to clone these external references
4. The `.interim` files are temporary during the sync process
5. Timing issues can cause clone attempts before/after the interim files exist

## Current Behavior (January 2026)

- **11 receipts tested**: All displayed correctly on receiving device
- **Errors logged**: ~8 different UUIDs showed clone failures
- **User experience**: No visible impact - receipts load and display properly
- **Conclusion**: Errors appear to be transient/cosmetic during sync process

## Potential Root Causes (If Issues Resurface)

### 1. Stale/Orphaned References
External data references from deleted receipts may persist in the database while the actual files are gone.

**Diagnosis**: Check if error UUIDs match current receipts or deleted ones.

**Fix**: Run a cleanup to remove orphaned external data references.

### 2. Sync Timing Race Condition
Core Data attempts to clone files before CloudKit has fully transferred the assets.

**Diagnosis**: Check if errors occur only on initial sync, then resolve.

**Fix**: Usually self-resolving. If persistent, add delay before accessing receipt data after sync.

### 3. App Group Container Mismatch
External data stored in App Group may not be accessible to shared store context.

**Diagnosis**: Verify both private and shared stores use the same App Group container.

**Fix**: Ensure `NSPersistentStoreDescription` uses consistent App Group URLs.

### 4. CKAsset vs External Storage Conflict
CloudKit may sync binary data as `CKAsset` while Core Data expects local external files.

**Diagnosis**: Check CloudKit Dashboard for asset records vs external file presence.

**Fix**: May need to disable `allowsExternalBinaryDataStorage` or migrate to explicit CKAsset handling.

## Architecture Constraints

**Why not use iCloud Drive (ubiquity container) for receipt files?**

CloudKit zone sharing shares a *zone* within the owner's private database. The participant accesses this shared zone, not the owner's iCloud Drive. Files stored in the ubiquity container are NOT accessible to share participants - only CloudKit records/assets in the shared zone are visible.

**Current approach**: Store `fileData` directly in Core Data with external storage enabled. CloudKit handles syncing via `CKAsset` internally.

## If Errors Cause Actual Failures

### Option A: Disable External Storage (Quick Fix)

In `HSA_Storage.xcdatamodeld`, change:
```xml
<!-- From -->
<attribute name="fileData" ... allowsExternalBinaryDataStorage="YES"/>

<!-- To -->
<attribute name="fileData" ... />
```

**Tradeoffs**:
- (+) Guarantees binary data syncs inline with record
- (-) Increases SQLite database size
- (-) May slow queries if receipts are large
- (-) Requires migration for existing data

### Option B: Compress Before Storage

Reduce `fileData` size so it stores inline more often:
```swift
// Before saving
receipt.fileData = originalData.compressed(using: .lzfse)

// When reading
let originalData = receipt.fileData?.decompressed(using: .lzfse)
```

### Option C: Explicit CKAsset Management

Manually manage binary data as CloudKit assets instead of relying on Core Data's automatic handling. More complex but gives full control over sync behavior.

## Monitoring

Add logging to track external data issues:

```swift
// In PersistenceController or CloudKitSharingService
NotificationCenter.default.addObserver(
    forName: NSNotification.Name.NSPersistentStoreRemoteChange,
    object: nil,
    queue: .main
) { notification in
    // Log sync events for debugging
    print("CloudKit sync event: \(notification)")
}
```

## Related Files

- `HSA_Storage.xcdatamodeld` - Core Data model with `fileData` attribute
- `CloudKitSharingService.swift` - Zone sharing implementation
- `PersistenceController.swift` - Core Data stack configuration
- `ReceiptStorageService.swift` - Receipt file handling (if exists)

## Testing Checklist

When retesting CloudKit sharing:

- [ ] Fresh install on receiving device (delete app first)
- [ ] Create new household share from scratch
- [ ] Add receipts with various file sizes (small <100KB, large >1MB)
- [ ] Verify receipts display on receiving device
- [ ] Check Xcode console for external data errors
- [ ] Test editing/deleting receipts from both devices
- [ ] Test after backgrounding app for extended period
- [ ] Test after device restart

## References

- Apple: [Sharing Core Data Objects Between iCloud Users](https://developer.apple.com/documentation/coredata/sharing_core_data_objects_between_icloud_users)
- Apple: [NSPersistentCloudKitContainer](https://developer.apple.com/documentation/coredata/nspersistentcloudkitcontainer)
- WWDC 2019: [Using Core Data With CloudKit](https://developer.apple.com/videos/play/wwdc2019/202/)
- WWDC 2021: [Build apps that share data through CloudKit and Core Data](https://developer.apple.com/videos/play/wwdc2021/10015/)

---

*Document created: January 2026*
*Last tested: 11 receipts synced successfully despite clone errors*
