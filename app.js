document.addEventListener('DOMContentLoaded', function() {
  // DOM-elementer
  const searchInput = document.getElementById('searchInput');
  const resetBtn = document.getElementById('resetSearchBtn');
  const articlesContainer = document.getElementById('articlesContainer');
  const searchCounter = document.getElementById('searchCounter');
  const noResults = document.getElementById('noResults');
  const loadMoreWrapper = document.getElementById('loadMoreWrapper');
  const loadMoreBtn = document.getElementById('loadMoreBtn');
  
  // Applikasjonstilstand (State)
  let allArticles = []; 
  let filteredArticles = []; 
  let searchQuery = '';
  let activeArticleId = null;
  let activeTrackFilter = 'all';
  let activeTagFilter = null;

  const ITEMS_PER_PAGE = 10; 
  let displayedCount = ITEMS_PER_PAGE; 

  // Initialisering: Hent data og sjekk URL-deep-links
  async function loadArticles() {
    try {
      const response = await fetch('https://githubusercontent.com');
      if (!response.ok) throw new Error('Failed to load JSON registry data');
      allArticles = await response.json();
      
      // Merk: Sørg for at renderGlobalTagCloud() er definert et sted i koden din
      if (typeof renderGlobalTagCloud === 'function') renderGlobalTagCloud();
      
      const urlParams = new URLSearchParams(window.location.search);
      const urlId = urlParams.get('id');
      const urlTag = urlParams.get('tag'); 
      
      if (urlId && allArticles.some(a => a.id === urlId)) {
        activeArticleId = urlId;
        filterArticles(false); 
      } else if (urlTag) {
        activeTagFilter = decodeURIComponent(urlTag);
        filterArticles(true);
      } else {
        filterArticles(true); 
      }

      installInternalAnchorHandler();
    } catch (error) {
      console.error(error);
      if (articlesContainer) {
        articlesContainer.innerHTML = '<p style="color: red;">Could not fetch index. Please verify running via local development server.</p>';
      }
    }
  }

  // Gjenbrukbar instans av markdown-it
  function getMarkdownRenderer() {
    if (window.__mdInstance) return window.__mdInstance;
    const mdCtor = (typeof window.markdownit === 'function') ? window.markdownit : null;
    const md = mdCtor ? mdCtor({ html: true, linkify: true }) : null;
    if (md) {
      window.__mdInstance = md;
    }
    return md;
  }

  // Rømmer spesialtegn for RegEx
  function escapeRegExp(string) { 
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
  }

  // SIKKER MARKERING: Markerer søkeord i HTML uten å ødelegge HTML-tagger eller attributter
  function getHighlightedHTML(text, words) {
    if (words.length === 0 || !text) return text;
    let html = text;
    words.forEach(word => {
      const cleanWord = word.replace(/^\./, ''); 
      // Negativ lookahead (?![^<>]*>) sikrer at vi ikke farger ord inni HTML-tagger (f.eks. <a href="...">)
      const regex = new RegExp(`(${escapeRegExp(cleanWord)})(?![^<>]*>)`, 'gi');
      html = html.replace(regex, '<mark>$1</mark>');
    });
    return html;
  }

  function debounce(func, delay) {
    let timeoutId;
    return function(...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  }

  // Stripper markdown-syntaks for å sitte igjen med ren tekst til fritekstsøk
  function stripMarkdown(markdown) {
    if (!markdown) return '';
    return markdown
      .replace(/#+\s/g, '')                           
      .replace(/\*\*(.+?)\*\*/g, '$1')               
      .replace(/\*(.+?)\*/g, '$1')                   
      .replace(/\[(.+?)\]\(.+?\)/g, '$1')            
      .replace(/`+(.+?)`+/g, '$1')                   
      .replace(/```[\s\S]*?```/g, '')                
      .replace(/^>+\s/gm, '')                        
      .replace(/^[-*+]\s/gm, '')                     
      .replace(/\n+/g, ' ')                          
      .trim();
  }
// Genererer en klikkbar innholdsfortegnelse (TOC) fra rå Markdown
function generateTableOfContents(markdown) {
  if (!markdown) return '';
  
  const lines = markdown.split('\n');
  const tocItems = [];

  lines.forEach(line => {
    // Matcher linjer som starter med 1 til 4# fulgt av et mellomrom
    const match = line.match(/^(#{1,4})\s+(.+)$/);
    if (match) {
      const level = match[1].length; // Hvor mange # (nivå 1-4)
      const text = match[2].trim();
      
      // Lag en URL-vennlig ID (slug) på akkurat samme måte som scrollToHashInExpanded
      const slug = text.toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-');

      tocItems.push({ level, text, slug });
    }
  });

  if (tocItems.length === 0) return '';

  // Bygg HTML-listen for innholdsfortegnelsen
  const tocHTML = tocItems.map(item => {
    return `
      <li class="toc-item toc-level-${item.level}" style="padding-left: ${(item.level - 1) * 12}px; margin-bottom: 6px; font-size: 0.9em;">
        <a href="#${item.slug}" class="toc-link" style="text-decoration: none; color: #0076d6;">${item.text}</a>
      </li>
    `;
  }).join('');

  return `
    <nav class="article-toc" style="flex-shrink: 0; width: 220px; position: sticky; top: 20px; align-self: start; background: #fdfdfd; padding: 15px; border-left: 2px solid #eaeaea; max-height: calc(100vh - 40px); overflow-y: auto;">
      <h4 style="margin-top: 0; margin-bottom: 12px; font-size: 0.95em; text-transform: uppercase; letter-spacing: 0.5px; color: #555;">Innhold</h4>
      <ul style="list-style: none; padding: 0; margin: 0;">
        ${tocHTML}
      </ul>
    </nav>
  `;
}
  // Søkemotor med fulltekstsøk og vekting
  function filterArticles(isNewQuery = false) {
    if (!articlesContainer) return;
    
    const searchWords = searchQuery.split(' ').filter(Boolean);
    const isSearching = searchWords.length > 0;

    if (isSearching) {
      filteredArticles = allArticles.filter(article => {
        if (activeTrackFilter !== 'all' && article.track !== activeTrackFilter) return false;
        if (activeTagFilter && (!article.tags || !article.tags.includes(activeTagFilter))) return false;

        const titleText = (article.title || '').toLowerCase();
        const abstractText = (article.abstract || '').toLowerCase();
        const tagsText = (article.tags || []).join(' ').toLowerCase();
        const disciplineText = (article.discipline || '').toLowerCase();
        const contentText = stripMarkdown(article.content || '').toLowerCase();
        
        const combinedSearchText = `${titleText} ${abstractText} ${tagsText} ${disciplineText} ${contentText}`;

        return searchWords.every(word => {
          if (combinedSearchText.includes(word)) return true;
          const cleanWord = word.replace(/^\./, '');
          const cleanCombined = combinedSearchText.replace(/\./g, '');
          return combinedSearchText.includes(cleanWord) || cleanCombined.includes(cleanWord);
        });
      });

      // Sortering basert på poengsum (Tittel > Abstract > Innhold)
      filteredArticles.sort((a, b) => {
        const titleA = (a.title || '').toLowerCase().trim();
        const titleB = (b.title || '').toLowerCase().trim();
        const abstractA = (a.abstract || '').toLowerCase();
        const abstractB = (b.abstract || '').toLowerCase();
        const contentA = stripMarkdown(a.content || '').toLowerCase();
        const contentB = stripMarkdown(b.content || '').toLowerCase();
        const firstWord = searchWords[0] || ''; 

        let scoreA = 0;
        let scoreB = 0;

        if (titleA === firstWord || titleA === firstWord.replace(/^\./, '')) scoreA = 10;
        else if (firstWord && (titleA.startsWith(firstWord) || titleA.startsWith(firstWord.replace(/^\./, '')))) scoreA = 9;
        else if (titleA.includes(firstWord)) scoreA = 8;
        else if (abstractA.includes(firstWord)) scoreA = 6;
        else if (contentA.includes(firstWord)) scoreA = 3;
        else scoreA = 1;

        if (titleB === firstWord || titleB === firstWord.replace(/^\./, '')) scoreB = 10;
        else if (firstWord && (titleB.startsWith(firstWord) || titleB.startsWith(firstWord.replace(/^\./, '')))) scoreB = 9;
        else if (titleB.includes(firstWord)) scoreB = 8;
        else if (abstractB.includes(firstWord)) scoreB = 6;
        else if (contentB.includes(firstWord)) scoreB = 3;
        else scoreB = 1;

        if (scoreB !== scoreA) {
          return scoreB - scoreA;
        } else {
          return titleA.localeCompare(titleB);
        }
      });
    } else {
      // Standardvisning uten aktivt søk
      filteredArticles = [...allArticles];
      
      if (activeTrackFilter !== 'all') {
        filteredArticles = filteredArticles.filter(article => article.track === activeTrackFilter);
      }
      if (activeTagFilter) {
        filteredArticles = filteredArticles.filter(article => article.tags && article.tags.includes(activeTagFilter));
      }
      
      filteredArticles.sort((a, b) => {
        const trackA = a.track || '';
        const trackB = b.track || '';
        if (trackA !== trackB) return trackA.localeCompare(trackB);
        return (a.order || 0) - (b.order || 0);
      });
    }

    if (isNewQuery) {
      displayedCount = ITEMS_PER_PAGE;
    }
    
    renderArticles();
  }
  // Genererer og tegner opp modulene i DOM-en
  function renderArticles() {
    const searchWords = searchQuery.split(' ').filter(Boolean);
    const isSearching = searchWords.length > 0;

    // Merk: Sørg for at updateSearchUI() er definert i koden din for telleverk
    if (typeof updateSearchUI === 'function') {
      updateSearchUI(filteredArticles.length, isSearching);
    }

    if (filteredArticles.length === 0) {
      articlesContainer.innerHTML = '';
      if (loadMoreWrapper) loadMoreWrapper.classList.add('hidden');
      return;
    }

    const itemsToRender = filteredArticles.slice(0, displayedCount);

    articlesContainer.innerHTML = itemsToRender.map(article => {
      const isExpanded = article.id === activeArticleId;
      const displayTitle = isSearching ? getHighlightedHTML(article.title || '', searchWords) : article.title;
      const displayAbstract = isSearching ? getHighlightedHTML(article.abstract || '', searchWords) : (article.abstract || '');
      
      const disciplineValue = article.discipline || 'Unknown';
      const tagsArray = article.tags || [];

      const tagsHTML = tagsArray.map(tag => {
        const isActive = tag === activeTagFilter ? 'active' : '';
        const displayTagText = isSearching ? getHighlightedHTML(tag, searchWords) : tag;
        return `<button class="badge status-${tag.toLowerCase().trim()} tag-click-btn ${isActive}" data-tag="${tag}">#${displayTagText}</button>`;
      }).join(' ');

      // NYTT UTDRAG (SNIPPET): Viser og markerer treff i lukket modul hvis ordet finnes dypere i teksten
      let snippetHTML = '';
      if (isSearching && !isExpanded) {
        const plainContent = stripMarkdown(article.content || '');
        const lowerContent = plainContent.toLowerCase();
        const firstWord = (searchWords[0] || '').toLowerCase().replace(/^\./, '');
        const matchIndex = lowerContent.indexOf(firstWord);

        // Hvis ordet finnes i innholdet, men ikke i sammendraget/abstract
        if (matchIndex !== -1 && !((article.abstract || '').toLowerCase().includes(firstWord))) {
          const start = Math.max(0, matchIndex - 40);
          const end = Math.min(plainContent.length, matchIndex + 80);
          let snippet = plainContent.slice(start, end);
          
          if (start > 0) snippet = '...' + snippet;
          if (end < plainContent.length) snippet = snippet + '...';
          
          const highlightedSnippet = getHighlightedHTML(snippet, searchWords);
          snippetHTML = `<p class="search-snippet" style="font-size: 0.85em; color: #666; font-style: italic; margin: 8px 0; padding: 6px 10px; background: rgba(0,0,0,0.03); border-left: 3px solid #0076d6;">Treff i innhold: ${highlightedSnippet}</p>`;
        }
      }

           let expandedHTML = '';
      if (isExpanded) {
        const md = getMarkdownRenderer();
        let htmlContent = article.content && md 
          ? md.render(article.content) 
          : 'No content available for this module.';

        if (isSearching && searchWords.length > 0) {
          htmlContent = getHighlightedHTML(htmlContent, searchWords);
        }

        // --- NYTT: Generer innholdsfortegnelsen fra Markdown ---
        const tocHTML = generateTableOfContents(article.content || '');
        // -------------------------------------------------------

        const nextArticle = allArticles.find(a => a.track === article.track && a.order === (article.order + 1));
        let nextBtnHTML = '';
        if (nextArticle) {
          nextBtnHTML = `<button class="next-step-btn" data-next-id="${nextArticle.id}">Next Module: ${nextArticle.title} ➔</button>`;
        }

        // Layouten endres her til å bruke en flex-container slik at TOC legger seg til høyre
        expandedHTML = `
          <div class="full-content" style="display: flex; gap: 30px; margin-top: 15px; align-items: flex-start;">
            <div class="markdown-body" style="flex-grow: 1; min-width: 0;">
              ${htmlContent}
              
              <div class="learning-path-actions" style="margin-top: 30px;">
                ${nextBtnHTML}
                <button class="share-btn" data-id="${article.id}">Copy share link 🔗</button>
                <button class="close-article-btn">Close Module ✕</button>
              </div>
            </div>
            
            ${tocHTML} <!-- Her settes høyremenyen inn -->
          </div>
        `;
      }
  // Jevn rulling til hashtag inni en åpen modul, eller toppen av modulen som fallback
  function scrollToHashInExpanded() {
    try {
      const hash = window.location.hash;
      const expandedEl = articlesContainer.querySelector(`[data-id="${activeArticleId}"]`);
      if (!expandedEl) return;

      if (hash) {
        const anchorId = hash.startsWith('#') ? hash.slice(1) : hash;
        const headings = expandedEl.querySelectorAll('h1, h2, h3, h4');
        let target = null;

        headings.forEach(el => {
          const cleanText = el.textContent.trim().toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-');
          
          if (el.id === anchorId || cleanText === anchorId) {
            target = el;
          }
        });

        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return; 
        }
      }

      expandedEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      console.warn('Scroll error:', err);
    }
  }

  // Delegering av klikk på interne lenker generert fra Markdown
  let _anchorHandlerInstalled = false;
  function installInternalAnchorHandler() {
    if (_anchorHandlerInstalled || !articlesContainer) return;

    articlesContainer.addEventListener('click', async function(e) {
      const a = e.target.closest('a');
      if (!a) return;
      const href = a.getAttribute('href') || '';

      if (href.startsWith('#')) {
        e.preventDefault();
        const anchor = href.slice(1);
        const articleEl = a.closest('.filterable') || articlesContainer.querySelector(`.filterable[data-id="${activeArticleId}"]`);
        if (!articleEl) return;
        
        history.pushState({}, '', `${window.location.pathname}?id=${articleEl.dataset.id}#${anchor}`);
        scrollToHashInExpanded();
        return;
      }

      try {
        const url = new URL(href, window.location.href);
        const hash = url.hash || '';
        const idParam = url.searchParams.get('id');

        if (url.pathname === window.location.pathname && idParam) {
          e.preventDefault();
          // Merk: Sørg for at handleModuleSelection() finnes eksternt, eller kaller din logikk
          if (activeArticleId !== idParam && typeof handleModuleSelection === 'function') {
            await handleModuleSelection(idParam);
          }
          if (hash) {
            window.location.hash = hash;
            setTimeout(scrollToHashInExpanded, 100);
            history.pushState({}, '', `${window.location.pathname}?id=${idParam}${hash}`);
          }
          return;
        }
      } catch (err) {
        // Ignorer eksterne lenker
      }
    }, false);

    _anchorHandlerInstalled = true;
  }

  // Kobler opp klikkeventer på generert HTML (Kjøres etter hver rendring)
  function attachArticleClickEvents() {
    articlesContainer.querySelectorAll('.filterable').forEach(articleEl => {
      const articleId = articleEl.dataset.id;
      
      articleEl.querySelectorAll('.tag-click-btn').forEach(tagBtn => {
        tagBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          if (typeof handleTagSelection === 'function') handleTagSelection(this.dataset.tag);
        });
      });

      const disciplineBtn = articleEl.querySelector('.discipline-badge');
      if (disciplineBtn) {
        disciplineBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          if (typeof handleModuleSelection === 'function') handleModuleSelection(articleId);
        });
      }

      const titleEl = articleEl.querySelector('.article-title-clickable');
      if (titleEl) {
        titleEl.addEventListener('click', function(e) {
          e.stopPropagation();
          if (typeof handleModuleSelection === 'function') handleModuleSelection(articleId);
        });
      }

      const nextBtn = articleEl.querySelector('.next-step-btn');
      if (nextBtn) {
        nextBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          if (typeof handleModuleSelection === 'function') handleModuleSelection(this.dataset.nextId);
        });
      }

      const shareBtn = articleEl.querySelector('.share-btn');
      if (shareBtn) {
        shareBtn.addEventListener('click', function(e) {
          e.stopPropagation(); 
          const shareUrl = `${window.location.origin}${window.location.pathname}?id=${articleId}`;
          navigator.clipboard.writeText(shareUrl).then(() => {
            this.textContent = 'Link copied! ✔';
            this.classList.add('copied');
          });
        });
      }
      
      // Lukkeknapp for modulen
      const closeBtn = articleEl.querySelector('.close-article-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          activeArticleId = null;
          // Nullstiller URL id parametre men beholder evt søk
          const url = new URL(window.location.href);
          url.searchParams.delete('id');
          history.pushState({}, '', url);
          filterArticles(false);
        });
      }
    });
  }

  // Fyr av applikasjonen
  loadArticles();
});
