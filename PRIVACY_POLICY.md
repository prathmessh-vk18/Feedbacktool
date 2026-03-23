# Privacy Policy for Pinpoint Extension

**Effective Date:** March 23, 2026

Thank you for choosing to use the Pinpoint ("we", "our", or "us") Chrome Extension. This Privacy Policy is designed to help you understand what information we collect, why we collect it, and how you can update, manage, export, and delete your information.

## 1. Data Collection and Usage

Pinpoint operates entirely locally on your device. The single purpose of this extension is to allow users to capture screenshots of active web pages, add design feedback annotations, and download a compiled report. 

In order to provide this core functionality, Pinpoint requires access to:
- **Website Content:** When you click the capture button, the extension temporarily stores a screenshot of the visible area of your active tab.
- **URLs:** The URL of the specific page you capture is recorded alongside the screenshot to generate an accurate design footprint.
- **User Annotations:** Any text comments or visual highlights you add to the screenshots.

## 2. Local Storage Only

**All captured data (screenshots, URLs, and annotations) is stored locally on your device using Chrome's built-in local storage API (`chrome.storage.local`).** 

We do **not**:
- Transmit, upload, or sync your screenshots, website content, or annotations to any external servers or third-party databases.
- Track your browsing behavior or web history.
- Collect Analytics or telemetry data.
- Monetize, sell, or share your data because none of it ever leaves your computer.

## 3. Your Control Over Data

Because your data is exclusively stored locally within your Chrome Browser environment, you have complete control over it:
- You can delete individual screenshots at any time using the Delete button within the extension's Sidepanel.
- You can clear all data globally by either removing all items from the list or uninstalling the extension entirely, which prompts Chrome to purge its localized storage container automatically.
- Your data exits the browser only when you explicitly click the "Download .docx" button, which compiles the locally-stored images into a document that is saved uniquely to your device's downloads folder.

## 4. Third-Party Services

Pinpoint does not integrate with any third-party data tracking, advertising, or analytics SDKs. It natively compiles the `.docx` file using bundled offline dependencies.

## 5. Changes to this Policy

We may update our Privacy Policy from time to time. Since the extension relies exclusively on local resources, any future updates will only reflect changes in the extension's functional feature-set, rather than server-side practices. We advise you to review this page periodically for any changes.

## 6. Contact Us

If you have any questions or suggestions about our Privacy Policy, do not hesitate to reach out by opening an issue on our GitHub repository.
