// content.js - Reads and extracts meaningful page content for EmailCraft AI

function detectPageType() {
  const url = window.location.href;
  if (url.includes('linkedin.com/in/')) return 'linkedin_profile';
  if (url.includes('linkedin.com/jobs/')) return 'job_posting';
  if (url.includes('github.com')) return 'github';
  if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter';
  if (document.querySelector('article') || document.querySelector('[role="article"]')) return 'article';
  if (url.includes('mail.google.com')) return 'gmail';
  if (url.includes('outlook.')) return 'outlook';
  return 'generic';
}

function extractGmailHistory() {
  const messages = document.querySelectorAll('.h7, .gs, .ii.gt');
  if (!messages.length) return extractGeneric();
  let text = Array.from(messages)
    .map(m => m.innerText.trim())
    .filter(t => t.length > 10)
    .join('\n\n---\n\n');
  return `Email Thread History:\n${text}`.substring(0, 3000);
}

function extractLinkedInProfile() {
  const name = document.querySelector('h1')?.innerText?.trim() || '';
  const headline = document.querySelector('.text-body-medium')?.innerText?.trim() || '';
  const about = document.querySelector('#about')?.closest('section')?.innerText?.trim() || '';
  const experience = document.querySelector('#experience')?.closest('section')?.innerText?.trim() || '';
  const company = document.querySelector('.pv-text-details__right-panel')?.innerText?.trim() || '';

  return `LinkedIn Profile:
Name: ${name}
Headline: ${headline}
${company ? 'Company Info: ' + company : ''}
${about ? 'About: ' + about.substring(0, 500) : ''}
${experience ? 'Experience: ' + experience.substring(0, 600) : ''}`.trim();
}

function extractArticle() {
  // Try multiple strategies to get article content
  const selectors = [
    'article',
    '[role="article"]',
    '.post-content',
    '.article-content',
    '.entry-content',
    'main',
    '.content'
  ];

  let text = '';
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText.length > 200) {
      text = el.innerText;
      break;
    }
  }

  if (!text) {
    // Fallback: get all paragraphs
    text = Array.from(document.querySelectorAll('p'))
      .map(p => p.innerText)
      .filter(t => t.length > 50)
      .join('\n\n');
  }

  return text.substring(0, 3000);
}

function extractJobPosting() {
  const title = document.querySelector('h1')?.innerText?.trim() || '';
  const company = document.querySelector('.topcard__org-name-link, .jobs-unified-top-card__company-name')?.innerText?.trim() || '';
  const description = document.querySelector('.description__text, .jobs-description')?.innerText?.trim() || '';
  return `Job Posting:
Title: ${title}
Company: ${company}
Description: ${description.substring(0, 2000)}`;
}

function extractGeneric() {
  const title = document.title || '';
  const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
  const h1 = document.querySelector('h1')?.innerText?.trim() || '';
  const mainText = extractArticle();
  return `Page: ${title}
${h1 ? 'Heading: ' + h1 : ''}
${metaDesc ? 'Description: ' + metaDesc : ''}
Content: ${mainText}`;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXTRACT_CONTENT') {
    const pageType = detectPageType();
    let content = '';

    try {
      switch (pageType) {
        case 'linkedin_profile':
          content = extractLinkedInProfile();
          break;
        case 'job_posting':
          content = extractJobPosting();
          break;
        case 'article':
          content = extractArticle();
          break;
        case 'gmail':
          content = extractGmailHistory();
          break;
        default:
          content = extractGeneric();
      }
    } catch (e) {
      content = document.body?.innerText?.substring(0, 2000) || '';
    }

    sendResponse({
      content: content.trim(),
      title: document.title,
      url: window.location.href,
      pageType
    });
    return true;
  } else if (message.type === 'INSERT_INTO_COMPOSE') {
    let composeBoxes = Array.from(document.querySelectorAll('div[aria-label="Message Body"], .Am.Al.editable, [role="textbox"][contenteditable="true"]'));
    let el = composeBoxes.find(b => b.offsetParent !== null); // get visible one

    if (el) {
      el.focus();
      const htmlText = message.text.replace(/\n/g, '<br>');
      if (!document.execCommand('insertHTML', false, htmlText)) {
        if (el.isContentEditable) {
          el.innerHTML += (el.innerHTML.endsWith('<br>') ? '' : '<br>') + htmlText;
        } else {
          el.value += '\n' + message.text;
        }
      }
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'Could not find an open compose box.' });
    }
    return true;
  }
});
