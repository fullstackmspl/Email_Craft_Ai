// background.js - Service Worker for EmailCraft AI

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setOptions({ enabled: true });
});

// Listen for messages from content scripts or sidepanel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_PAGE_CONTENT') {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url && !tabs[0].url.startsWith('chrome://')) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'EXTRACT_CONTENT' }, (response) => {
          if (chrome.runtime.lastError) {
            // Content script missing, auto-inject it
            chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              files: ['content.js']
            }).then(() => {
              chrome.tabs.sendMessage(tabs[0].id, { type: 'EXTRACT_CONTENT' }, (resp2) => {
                sendResponse(resp2 || { content: '', title: '', url: '', pageType: 'generic' });
              });
            }).catch(() => {
              sendResponse({ content: '', title: '', url: '', pageType: 'generic' });
            });
            return;
          }
          sendResponse(response || { content: '', title: '', url: '', pageType: 'generic' });
        });
      } else {
        sendResponse({ content: '', title: '', url: '', pageType: 'generic' });
      }
    });
    return true; // async
  }
});
