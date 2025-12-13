chrome.action.onClicked.addListener(() => {
  // dashboard.html を新しいタブで開く
  chrome.tabs.create({ url: 'dashboard.html' });
});