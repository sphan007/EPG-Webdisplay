class EPGApp {
  constructor() {
    this.baseUrl = 'https://d3bd0tgyk368z1.cloudfront.net/feeds/epg/channel/channelYYYY-MM-DD';
    this.currentDate = new Date();
    this.selectedDate = null;
    this.scheduleData = new Map();

    this.init();
  }

  init() {
    this.displayTimezone();
    this.createTabs();
    this.selectFirstTab();
  }

  displayTimezone() {
    const timezoneInfo = document.getElementById('timezoneInfo');
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const shortTimezone = new Date().toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop();
    timezoneInfo.textContent = `Times shown in your timezone: ${shortTimezone}`;
  }

  createTabs() {
    const tabsContainer = document.getElementById('dayTabs');
    // Use December 2024 date range instead of system's incorrect 2025 date
    const today = new Date();

    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);

      const tab = document.createElement('div');
      tab.className = 'tab';
      tab.textContent = this.formatTabLabel(date, i);
      tab.dataset.date = this.formatDateForUrl(date);

      tab.addEventListener('click', () => this.selectTab(tab, date));

      tabsContainer.appendChild(tab);
    }
  }

  formatTabLabel(date, dayIndex) {
    const days = ['Sun,', 'Mon,', 'Tue,', 'Wed,', 'Thu,', 'Fri,', 'Sat,'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    if (dayIndex === 0) return 'Today';
    //if (dayIndex === 1) return 'Tomorrow';

    return `${days[date.getDay()]} ${months[date.getMonth()]} ${date.getDate()}`;
  }

  formatDateForUrl(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  selectFirstTab() {
    const firstTab = document.querySelector('.tab');
    if (firstTab) {
      const today = new Date();
      this.selectTab(firstTab, today);
    }
  }

  async selectTab(tabElement, date) {
    // Update active tab
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    tabElement.classList.add('active');

    this.selectedDate = date;
    const dateKey = this.formatDateForUrl(date);

    // Show loading
    this.showLoading();

    try {
      // Get programs for this day and next day (to catch programs that extend past midnight)
      const currentDayPrograms = await this.getOrFetchScheduleData(dateKey);
      
      // Get next day's programs to find any that should be shown on current day
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      const nextDayKey = this.formatDateForUrl(nextDay);
      const nextDayPrograms = await this.getOrFetchScheduleData(nextDayKey);
      
      // Combine programs: current day programs + next day programs that extend past midnight
      const allPrograms = [
        ...currentDayPrograms.filter(p => !p.showOnPreviousDay),
        ...nextDayPrograms.filter(p => p.showOnPreviousDay)
      ];
      
      // Sort by start time
      allPrograms.sort((a, b) => {
        const aTime = a.startTime.dateObj || a.startTime;
        const bTime = b.startTime.dateObj || b.startTime;
        return aTime - bTime;
      });
      
      this.displaySchedule(allPrograms);
    } catch (error) {
      this.showError(`Failed to load schedule for ${dateKey}: ${error.message}`);
    }
  }

  async getOrFetchScheduleData(dateKey) {
    if (this.scheduleData.has(dateKey)) {
      return this.scheduleData.get(dateKey);
    } else {
      try {
        const scheduleData = await this.fetchScheduleData(dateKey);
        this.scheduleData.set(dateKey, scheduleData);
        return scheduleData;
      } catch (error) {
        console.warn(`Could not fetch data for ${dateKey}:`, error);
        return []; // Return empty array if can't fetch next day data
      }
    }
  }

  async fetchScheduleData(dateString) {
    const url = `${this.baseUrl}${dateString}.xml`;
    //console.log('Attempting to fetch URL:', url);

    try {
      // Try direct fetch first
      const response = await fetch(url, {
        mode: 'cors',
        cache: 'no-cache'
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
      }

      const xmlText = await response.text();
      return this.parseXMLSchedule(xmlText);
    } catch (error) {
      console.error('Direct fetch failed, trying CORS proxy:', error);

      // Try with CORS proxy as fallback
      try {
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        const proxyResponse = await fetch(proxyUrl);

        if (!proxyResponse.ok) {
          throw new Error(`Proxy HTTP error! status: ${proxyResponse.status} - ${proxyResponse.statusText}`);
        }

        const xmlText = await proxyResponse.text();
        return this.parseXMLSchedule(xmlText);
      } catch (proxyError) {
        console.error('Proxy fetch also failed:', proxyError);
        throw new Error(`Failed to fetch schedule data: ${error.message}. Proxy also failed: ${proxyError.message}`);
      }
    }
  }

  parseXMLSchedule(xmlText) {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

      // Check for parsing errors
      const parseError = xmlDoc.querySelector('parsererror');
      if (parseError) {
        throw new Error('XML parsing error');
      }

      const programs = [];
      const programElements = xmlDoc.querySelectorAll('programme');

      programElements.forEach(program => {
        const startTime = program.getAttribute('start');
        const stopTime = program.getAttribute('stop');
        const channel = program.getAttribute('channel');

        const titleElement = program.querySelector('title');
        const descElement = program.querySelector('desc');
        const subTitleElement = program.querySelector('sub-title');

        if (titleElement && startTime) {
          const parsedStartTime = this.parseXMLTime(startTime);
          const parsedStopTime = stopTime ? this.parseXMLTime(stopTime) : null;
          
          // Check if program extends past midnight and should be shown on previous day
          let shouldShowOnPreviousDay = false;
          if (parsedStartTime && parsedStopTime) {
            const startDate = parsedStartTime.dateObj;
            const stopDate = parsedStopTime.dateObj;
            
            // If program ends on a different day than it starts, show it on previous day
            if (stopDate && startDate && stopDate.getDate() !== startDate.getDate()) {
              shouldShowOnPreviousDay = true;
            }
          }
          
          programs.push({
            startTime: parsedStartTime,
            stopTime: parsedStopTime,
            channel: channel || '',
            title: titleElement.textContent || 'No Title',
            episodeTitle: subTitleElement ? subTitleElement.textContent : '',
            description: descElement ? descElement.textContent : '',
            showOnPreviousDay: shouldShowOnPreviousDay
          });
        }
      });

      // Sort programs by start time
      programs.sort((a, b) => {
        const aTime = a.startTime.dateObj || a.startTime;
        const bTime = b.startTime.dateObj || b.startTime;
        return aTime - bTime;
      });

      return programs;
    } catch (error) {
      console.error('Error parsing XML:', error);
      throw new Error('Failed to parse schedule data');
    }
  }

  parseXMLTime(timeString) {
    // XML time is in ISO 8601 format: 2024-12-18T00:00:00.000-0500
    if (!timeString) return { hour: 0, minute: 0, original: timeString };

    try {
      // Parse the ISO string - this gives us the correct Eastern Time
      const easternDate = new Date(timeString);
      
      // Convert Eastern Time to user's local timezone for display
      const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      
      // Create a new date in the user's timezone that represents the same moment
      const userLocalDate = new Date(easternDate.toLocaleString("en-US", {timeZone: userTimeZone}));
      
      return {
        hour: userLocalDate.getHours(),
        minute: userLocalDate.getMinutes(),
        second: userLocalDate.getSeconds(),
        original: timeString,
        // Keep Eastern Time date object for duration calculations and now playing detection
        dateObj: easternDate,
        // Add user local time for display
        localDateObj: userLocalDate
      };
    } catch (error) {
      console.error('Error parsing time string:', timeString, error);
      return { hour: 0, minute: 0, original: timeString };
    }
  }

  formatTime(timeObj) {
    // Display the original time from XML without conversion
    if (typeof timeObj === 'object' && timeObj.hour !== undefined) {
      const hour12 = timeObj.hour === 0 ? 12 : timeObj.hour > 12 ? timeObj.hour - 12 : timeObj.hour;
      const ampm = timeObj.hour >= 12 ? 'PM' : 'AM';
      const minute = String(timeObj.minute).padStart(2, '0');
      return `${hour12}:${minute} ${ampm}`;
    }
    // Fallback for old format
    return timeObj.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  showLoading() {
    const loadingElement = document.getElementById('loadingSpinner');
    const scheduleContainer = document.getElementById('scheduleContainer');

    loadingElement.style.display = 'block';
    scheduleContainer.style.display = 'none';
  }

  hideLoading() {
    const loadingElement = document.getElementById('loadingSpinner');
    const scheduleContainer = document.getElementById('scheduleContainer');

    loadingElement.style.display = 'none';
    scheduleContainer.style.display = 'block';
  }

  displaySchedule(programs) {
    this.hideLoading();

    const container = document.getElementById('scheduleContainer');

    if (!programs || programs.length === 0) {
      container.innerHTML = '<div class="no-data">No schedule data available for this day.</div>';
      return;
    }

    let html = '';
    programs.forEach(program => {
      const duration = this.calculateDuration(program.startTime, program.stopTime);
      const isNowPlaying = this.isCurrentlyPlaying(program);
      const nowPlayingClass = isNowPlaying ? ' now-playing' : '';
      
      html += `
        <div class="program${nowPlayingClass}">
          <div class="program-time">
            ${this.formatTime(program.startTime)}
            ${isNowPlaying ? '<div class="now-playing-text">Now Playing</div>' : ''}
          </div>
          <div class="program-details">
            <div class="program-title">${this.escapeHtml(program.title)}</div>
            ${program.episodeTitle ? `<div class="program-episode">${this.escapeHtml(program.episodeTitle)}</div>` : ''}
            ${program.description ? `<div class="program-description">${this.escapeHtml(program.description)}</div>` : ''}
            ${duration ? `<div class="program-duration">${duration}</div>` : ''}
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  isCurrentlyPlaying(program) {
    // Get current time in Eastern Time
    const now = new Date();
    const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    
    const startTime = program.startTime.dateObj;
    const stopTime = program.stopTime ? program.stopTime.dateObj : null;
    
    if (!startTime || !stopTime) return false;
    
    return easternTime >= startTime && easternTime <= stopTime;
  }

  calculateDuration(startTime, stopTime) {
    if (!startTime || !stopTime) return null;

    // Use dateObj for duration calculation if available
    const startDate = startTime.dateObj || startTime;
    const stopDate = stopTime.dateObj || stopTime;

    if (!startDate || !stopDate || typeof startDate.getTime !== 'function') return null;

    const durationMs = stopDate.getTime() - startDate.getTime();
    const durationMinutes = Math.round(durationMs / (1000 * 60));

    if (durationMinutes < 60) {
      return `${durationMinutes} minutes`;
    } else {
      const hours = Math.floor(durationMinutes / 60);
      const minutes = durationMinutes % 60;
      if (minutes === 0) {
        return `${hours} Hours`;
      } else {
        return `${hours} Hours ${minutes} minutes`;
      }
    }
  }

  showError(message) {
    this.hideLoading();
    const container = document.getElementById('scheduleContainer');
    container.innerHTML = `
      <div class="error">
        ${this.escapeHtml(message)}
        <br><br>
        <button onclick="location.reload()" class="retry-button">Retry</button>
      </div>
    `;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize the EPG app when the page loads
document.addEventListener('DOMContentLoaded', () => {
  new EPGApp();
});
