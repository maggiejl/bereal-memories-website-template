/* Copy to config.js via `python3 setup.py`, or fill this in by hand. */
window.BEREAL_CONFIG = {
  // Relative path to your unzipped BeReal export folder
  dataDir: "data",

  // Your BeReal user id (folder under Photos/, or first segment of the export folder name)
  userId: "YOUR_USER_ID",

  // Filled automatically by setup.py from conversations/*/chat_log.json
  conversationIds: [],

  // Optional: SHA-256 hex of ("bereal-memories-v1" + password). Empty string = no gate.
  // Soft gate only — anyone with the URL can still download static files.
  authPasswordHash: "",
};
