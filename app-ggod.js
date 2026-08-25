document.addEventListener('DOMContentLoaded', function() {
  const searchInput = document.getElementById('searchInput');
  const resetBtn = document.getElementById('resetSearchBtn');
  const articlesContainer = document.getElementById('articlesContainer');
  const searchCounter = document.getElementById('searchCounter');
  const noResults = document.getElementById('noResults');
  
  const loadMoreWrapper = document.getElementById('loadMoreWrapper');
  const loadMoreBtn = document.getElementById('loadMoreBtn');
  
  let allArticles = []; 
  let filteredArticles = []; 
  let searchQuery = '';
  let activeArticleId = null;
  let activeTrackFilter = 'all';

  const ITEMS_PER_PAGE = 10; 
  let displayedCount = ITEMS_PER_PAGE; 

  // Initialize the engine and check URL deep-links
  async function loadArticles() {
    try {
      const response = await fetch('index.json');
      if (!response.ok) throw new Error('Failed to load JSON registry data');
      allArticles = await response.json();
      
      const urlParams = new URLSearchParams(window.location.search);
      const urlId = urlParams.get('id');
      
      if (urlId && allArticles.some(a => a.id === urlId)) {
        activeArticleId = urlId;
        filterArticles(false); 
        triggerDirectLinkFetch(urlId); 
      } else {
        filterArticles(true); 
      }
    } catch (error) {
      console.error(error);
      if (articlesContainer) {
        articlesContainer.innerHTML = '<p style="color: red;">Could not fetch index. Please verify running via local development server.</p>';
      }
    }
  }

  // Auto-fetch Markdown for deep-linked modules
  async function triggerDirectLinkFetch(articleId) {
    const targetArticle = allArticles.find(a => a.id === articleId);
    if (targetArticle && !targetArticle.markdownContent) {
      try {
        const res = await fetch(`articles/${articleId}.md`);
        if (!res.ok) throw new Error('Markdown file not found');
        const mdText = await res.text();
        
        targetArticle.markdownContent = mdText;
        filterArticles(false);
        
        setTimeout(() => {
          const el = articlesContainer.querySelector(`[data-id="${articleId}"]`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      } catch (err) {
        console.error("Could not load direct link markdown:", err);
      }
    }
  }

  function escapeRegExp(string) { 
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
  }

  function getHighlightedHTML(text, words) {
    if (words.length === 0 || !text) return text;
    let html = text;
    words.forEach(word => {
      const cleanWord = word.replace(/^\./, ''); 
      const regex = new RegExp(`(${escapeRegExp(cleanWord)})`, 'gi');
      html = html.replace(regex, '<mark>$1</mark>');
    });
    return html;
  }

  function debounce(func, delay) {
    let timeoutId;
    return function(...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        func.apply(this, args);
      }, delay);
    };
  }
  // Search Engine: Filters and sorts elements by track order or relevance search
  function filterArticles(isNewQuery = false) {
    if (!articlesContainer) return;
    
    const searchWords = searchQuery.split(' ').filter(Boolean);
    const isSearching = searchWords.length > 0;

    if (isSearching) {
      filteredArticles = allArticles.filter(article => {
        // Filter out non-matching tracks immediately if filter is active
        if (activeTrackFilter !== 'all' && article.track !== activeTrackFilter) return false;

        const titleText = (article.title || '').toLowerCase();
        const abstractText = (article.abstract || '').toLowerCase();
        const combinedSearchText = `${titleText} ${abstractText}`;

        return searchWords.every(word => {
          if (combinedSearchText.includes(word)) return true;
          const cleanWord = word.replace(/^\./, '');
          const cleanTitle = combinedSearchText.replace(/\./g, '');
          return combinedSearchText.includes(cleanWord) || cleanTitle.includes(cleanWord);
        });
      });
      filteredArticles.sort((a, b) => {
        const titleA = (a.title || '').toLowerCase().trim();
        const titleB = (b.title || '').toLowerCase().trim();
        const firstWord = searchWords[0] || ''; 

        let scoreA = 0;
        let scoreB = 0;

        if (titleA === firstWord || titleA === firstWord.replace(/^\./, '')) {
          scoreA = 3;
        } else if (titleA.startsWith(firstWord) || titleA.startsWith(firstWord.replace(/^\./, ''))) {
          scoreA = 2;
        } else {
          scoreA = 1;
        }

        if (titleB === firstWord || titleB === firstWord.replace(/^\./, '')) {
          scoreB = 3;
        } else if (titleB.startsWith(firstWord) || titleB.startsWith(firstWord.replace(/^\./, ''))) {
          scoreB = 2;
        } else {
          scoreB = 1;
        }

        if (scoreB !== scoreA) {
          return scoreB - scoreA;
        } else {
          return titleA.localeCompare(titleB);
        }
      });
    } else {
      // Default state when not searching: Filter by active track if chosen
      filteredArticles = [...allArticles];
      
      if (activeTrackFilter !== 'all') {
        filteredArticles = filteredArticles.filter(article => article.track === activeTrackFilter);
      }
      
      // Sort by Track group first, then by the structured order sequence
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

  // Renders learning modules and controls pagination slicing
  function renderArticles() {
    const searchWords = searchQuery.split(' ').filter(Boolean);
    const isSearching = searchWords.length > 0;

    updateSearchUI(filteredArticles.length, isSearching);

    if (filteredArticles.length === 0) {
      articlesContainer.innerHTML = '';
      if (loadMoreWrapper) loadMoreWrapper.classList.add('hidden');
      return;
    }

    const itemsToRender = filteredArticles.slice(0, displayedCount);

    articlesContainer.innerHTML = itemsToRender.map(article => {
      const isExpanded = article.id === activeArticleId;
      const displayTitle = isSearching ? getHighlightedHTML(article.title || '', searchWords) : article.title;
      
      // Plassert korrekt for bruk i HTML-genereringen senere
      const displayAbstract = isSearching ? getHighlightedHTML(article.abstract || '', searchWords) : (article.abstract || '');
      
      const disciplineValue = article.discipline || 'Unknown';
      const tagsArray = article.tags || [];

      const tagsHTML = tagsArray.map(tag => 
        `<span class="badge status-${tag.toLowerCase().trim()}">${tag}</span>`
      ).join(' ');

      let expandedHTML = '';
      if (isExpanded) {
        // Robust initialization using your downloaded local script build
        let md = null;
        if (typeof window.markdownit === 'function') {
          md = new window.markdownit({ html: true, linkify: true });
        } else if (window.markdownit) {
          md = window.markdownit({ html: true, linkify: true });
        }
        
        let htmlContent = article.markdownContent && md ? md.render(article.markdownContent) : 'Loading module text...';

        // SIKRET: Disse ligger nå trygt plassert inne i if (isExpanded) blokken
        const nextArticle = allArticles.find(a => a.track === article.track && a.order === (article.order + 1));
        let nextBtnHTML = '';
        if (nextArticle) {
          nextBtnHTML = `<button class="next-step-btn" data-next-id="${nextArticle.id}">Next Module: ${nextArticle.title} ➔</button>`;
        }

        expandedHTML = `
          <div class="full-content">
            <div class="markdown-body">${htmlContent}</div>
            <div class="learning-path-actions">
              ${nextBtnHTML}
              <button class="share-btn" data-id="${article.id}">Copy share link 🔗</button>
              <button class="close-article-btn">Close Module ✕</button>
            </div>
          </div>
        `;
      } else {
        expandedHTML = `<button class="read-more-btn">Start Learning Module →</button>`;
      }


     return `
        <article class="filterable" data-id="${article.id}">
          <div class="article-header">
            <h2>${displayTitle}</h2>
            <div class="article-meta-inline">
              <span class="badge discipline-badge">${disciplineValue}</span>
              ${tagsHTML}
            </div>
          </div>
          <p class="abstract-text">${displayAbstract}</p>
          ${expandedHTML}
        </article>
      `;
    }).join('');

    // REPARERT: Denne linjen manglet, som gjorde at klikk-lytterne aldri ble aktivert på nytt!
    attachArticleClickEvents();

    if (loadMoreWrapper) {
      if (filteredArticles.length > displayedCount) {
        loadMoreWrapper.classList.remove('hidden');
      } else {
        loadMoreWrapper.classList.add('hidden');
      }
    }
  }

  // Async loaders, navigation logic, and clipboard event handling
  function attachArticleClickEvents() {
    articlesContainer.querySelectorAll('.filterable').forEach(articleEl => {
      
      articleEl.addEventListener('click', async function(e) {
        if (
          e.target.classList.contains('close-article-btn') || 
          e.target.classList.contains('share-btn') || 
          e.target.classList.contains('next-step-btn') ||
          e.target.type === 'checkbox'
        ) return;

        // SIKRET: Bruker 'this.dataset.id' (selve kortet) i stedet for 'e.target' 
        // slik at klikk på gule <mark>-ord eller badges alltid åpner riktig modul
        const articleId = this.dataset.id;
        handleModuleSelection(articleId);
      });

      // Next step navigation engine
      const nextBtn = articleEl.querySelector('.next-step-btn');
      if (nextBtn) {
        nextBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          const nextId = this.dataset.nextId;
          handleModuleSelection(nextId);
        });
      }

      const shareBtn = articleEl.querySelector('.share-btn');
      if (shareBtn) {
        shareBtn.addEventListener('click', function(e) {
          e.stopPropagation(); 
          const articleId = this.dataset.id;
          const shareUrl = `${window.location.origin}${window.location.pathname}?id=${articleId}`;
          
          navigator.clipboard.writeText(shareUrl).then(() => {
            this.textContent = 'Link copied! ✔';
            this.classList.add('copied');
            
            setTimeout(() => {
              this.textContent = 'Copy share link 🔗';
              this.classList.remove('copied');
            }, 2000);
          }).catch(err => {
            console.error('Could not copy link: ', err);
          });
        });
      }

      const closeBtn = articleEl.querySelector('.close-article-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          activeArticleId = null;
          history.pushState({}, '', window.location.pathname); 
          filterArticles(false);
        });
      }
    });
  }

  // Central state controller for processing learning track traversal
  async function handleModuleSelection(articleId) {
    const targetArticle = allArticles.find(a => a.id === articleId);

    if (activeArticleId === articleId) {
      activeArticleId = null;
      history.pushState({}, '', window.location.pathname); 
      filterArticles(false);
      return;
    }

    activeArticleId = articleId;
    history.pushState({id: articleId}, '', `?id=${articleId}`); 
    filterArticles(false);

    if (targetArticle && !targetArticle.markdownContent) {
      try {
        const res = await fetch(`articles/${articleId}.md`);
        if (!res.ok) throw new Error('Markdown file not found');
        const mdText = await res.text();
        
        targetArticle.markdownContent = mdText;
        filterArticles(false);
      } catch (err) {
        console.error("Could not load markdown details:", err);
        const contentEl = articlesContainer.querySelector(`[data-id="${articleId}"] .full-content`);
        if (contentEl) contentEl.innerHTML = '<p style="color:red;">Error loading document details.</p>';
        return;
      }
    }

    const newRenderedEl = articlesContainer.querySelector(`[data-id="${articleId}"]`);
    if (newRenderedEl) newRenderedEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function updateSearchUI(count, isSearching) {
    if (searchCounter) {
      searchCounter.textContent = isSearching 
        ? `Found ${count} matching steps sorted by relevance`
        : `Track index loaded. Total modules available: ${count}`;
    }
    if (noResults) noResults.classList.toggle('hidden', count > 0);
  }

  function resetEntireRegistry() {
    searchInput.value = ''; 
    searchQuery = ''; 
    activeArticleId = null;
    history.pushState({}, '', window.location.pathname); 
    if (resetBtn) resetBtn.classList.add('invisible');
    filterArticles(true);
  }

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', function() {
      displayedCount += ITEMS_PER_PAGE;
      renderArticles();
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', debounce(function(e) {
      const currentInput = e.target.value.trim();
      searchQuery = currentInput.toLowerCase();
      
      if (resetBtn) {
        if (currentInput.length > 0) {
          resetBtn.classList.remove('invisible');
        } else {
          resetBtn.classList.add('invisible');
        }
      }
      filterArticles(true);
    }, 250));
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', resetEntireRegistry);
  }

  // Role Selection Button Controller
  const filterButtons = document.querySelectorAll('.filter-btn');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', function() {
      filterButtons.forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      
      activeTrackFilter = this.dataset.track;
      filterArticles(true);
    });
  });

  loadArticles();
});
