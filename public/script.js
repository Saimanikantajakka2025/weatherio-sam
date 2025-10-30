(function () {
  // Default location: Hyderabad, India.
  const DEFAULT_LOCATION = {
    lat: 17.385,
    lon: 78.4867,
    tz: "Asia/Kolkata",
  };

  // DOM references
  const latInput = document.getElementById("lat-input");
  const lonInput = document.getElementById("lon-input");
  const saveLocation = document.getElementById("save-location");
  const statusEl = document.getElementById("status");
  const weatherCard = document.getElementById("weather-card");
  const tempEl = document.getElementById("temperature");
  const humidityEl = document.getElementById("humidity");
  const windEl = document.getElementById("wind");
  const precipEl = document.getElementById("precip");
  const conditionIcon = document.getElementById("condition-icon");
  const conditionText = document.getElementById("condition-text");
  const sourceEl = document.getElementById("source");
  const updateBtn = document.getElementById("update-btn");
  const removeBtn = document.getElementById("remove-btn");
  const todayBtn = document.getElementById("today-btn");
  const tomorrowBtn = document.getElementById("tomorrow-btn");
  const dayafterBtn = document.getElementById("dayafter-btn");
  const updateModal = document.getElementById("update-modal");
  const updateForm = document.getElementById("update-form");
  const cancelUpdate = document.getElementById("cancel-update");
  const updTemp = document.getElementById("upd-temp");
  const updHumidity = document.getElementById("upd-humidity");
  const updWind = document.getElementById("upd-wind");
  const updPrecip = document.getElementById("upd-precip");
  const updCondition = document.getElementById("upd-condition");

  // App state
  let locationData = null;
  let currentDateKey = "today";
  let currentWeather = null;
  let currentOverride = null;
  let userEmail = null; // ← from login

  // Ensure user is logged in
  function initUser() {
    userEmail = localStorage.getItem("userEmail");
   console.log(userEmail);
   
    if (!userEmail) {
      alert("Please log in to continue.");
      window.location.href = "/login.html";
      return false;
    }
    return true;
  }

  // Init location
  function initLocation() {
    try {
      const stored = localStorage.getItem("weatherLocation");
      if (stored) {
        const obj = JSON.parse(stored);
        if (obj && obj.lat && obj.lon) {
          locationData = obj;
        } else {
          locationData = DEFAULT_LOCATION;
        }
      } else {
        locationData = DEFAULT_LOCATION;
      }
    } catch {
      locationData = DEFAULT_LOCATION;
    }
    latInput.value = locationData.lat;
    lonInput.value = locationData.lon;
  }

  function saveLocationData() {
    locationData.lat = parseFloat(latInput.value);
    locationData.lon = parseFloat(lonInput.value);
    localStorage.setItem("weatherLocation", JSON.stringify(locationData));
    showStatus("Location saved.", "info");
    loadWeather(currentDateKey);
  }

  saveLocation.addEventListener("click", saveLocationData);

  // Status display
  function showStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.style.color = type === "error" ? "#e74c3c" : "#2c3e50";
  }

  // Compute ISO date string
  function getDateString(offsetDays) {
    const tz = locationData.tz || "UTC";
    const now = new Date();
    now.setDate(now.getDate() + offsetDays);
    const parts = now.toLocaleDateString("en-CA", { timeZone: tz }).split("-");
    return parts.join("-");
  }

  // Fetch from wttr.in (with cache)
  async function fetchWeather(dateString) {
    const cacheKey = `${locationData.lat},${locationData.lon},${dateString}`;
    let cache = {};
    try {
      cache = JSON.parse(localStorage.getItem("weatherCache") || "{}");
    } catch {
      cache = {};
    }

    const now = Date.now();
    if (cache[cacheKey] && now - cache[cacheKey].timestamp < 15 * 60 * 1000) {
      return cache[cacheKey].data;
    }

    const url = `https://wttr.in/${locationData.lat},${locationData.lon}?format=j1`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Failed to fetch weather data");

    const data = await resp.json();
    const weatherArr = data.weather || [];
    let weatherDay = weatherArr.find((w) => w.date === dateString);
    if (!weatherDay) weatherDay = weatherArr[0];

    const hourly = weatherDay.hourly || [];
    if (!hourly.length) throw new Error("No hourly data");

    const avg = (key) =>
      hourly.reduce((sum, h) => sum + parseFloat(h[key] || 0), 0) / hourly.length;
    const totalPrecip = hourly.reduce(
      (sum, h) => sum + parseFloat(h.precipMM || 0),
      0
    );

    const mid = hourly[Math.floor(hourly.length / 2)];
    const icon = weatherCodeToIcon(parseInt(mid.weatherCode || "0", 10));

    const weather = {
      tempC: avg("tempC").toFixed(1),
      humidityPct: Math.round(avg("humidity")),
      windKph: avg("windspeedKmph").toFixed(1),
      precipMm: totalPrecip.toFixed(1),
      conditionText:
        (mid.weatherDesc && mid.weatherDesc[0] && mid.weatherDesc[0].value) ||
        "",
      conditionIcon: icon,
      source: "api",
    };

    cache[cacheKey] = { data: weather, timestamp: now };
    localStorage.setItem("weatherCache", JSON.stringify(cache));

    return weather;
  }

  // Map weather codes to emoji
  function weatherCodeToIcon(code) {
    if (code === 113) return "☀️";
    if ([116, 119, 122].includes(code)) return "⛅";
    if ([143, 248, 260].includes(code)) return "🌫️";
    if (
      [
        176, 200, 263, 266, 281, 284, 293, 296, 299, 302, 305, 308, 311, 314,
        353, 356, 359, 386, 389,
      ].includes(code)
    )
      return "🌧️";
    if (
      [
        179, 227, 230, 317, 320, 323, 326, 329, 332, 335, 338, 350, 368, 371,
        374, 377, 392, 395,
      ].includes(code)
    )
      return "❄️";
    return "🌥️";
  }

  // Fetch user-specific override
  async function fetchOverride(dateString) {
    const params = new URLSearchParams({
      lat: String(locationData.lat),
      lon: String(locationData.lon),
      date: dateString,
      email: userEmail,
    });
    const resp = await fetch(`/override?${params.toString()}`);
    if (!resp.ok) throw new Error("Failed to fetch override");
    const data = await resp.json();
    return data && data.newValues ? data : null;
  }

  async function loadWeather(dateKey) {
    if (!userEmail) return;
    currentDateKey = dateKey;

    [todayBtn, tomorrowBtn, dayafterBtn].forEach((b) =>
      b.classList.remove("active")
    );
    if (dateKey === "today") todayBtn.classList.add("active");
    if (dateKey === "tomorrow") tomorrowBtn.classList.add("active");
    if (dateKey === "dayafter") dayafterBtn.classList.add("active");

    const offset = dateKey === "tomorrow" ? 1 : dateKey === "dayafter" ? 2 : 0;
    const dateString = getDateString(offset);

    showStatus("Loading...", "info");
    try {
      const weather = await fetchWeather(dateString);
      currentWeather = weather;

      const override = await fetchOverride(dateString);
      currentOverride = override;

      let combined = { ...weather };
      let source = "API";
      if (override && override.newValues) {
        combined = { ...combined, ...override.newValues };
        source = `Override (v${override.version})`;
      }

      renderWeather(combined, source);
      showStatus("", "info");
    } catch (err) {
      showStatus(err.message || "Error loading weather", "error");
    }
  }

  function renderWeather(data, source) {
    tempEl.textContent = `${data.tempC}°C`;
    humidityEl.textContent = data.humidityPct;
    windEl.textContent = data.windKph;
    precipEl.textContent = data.precipMm;
    conditionIcon.textContent = data.conditionIcon;
    conditionText.textContent = data.conditionText;
    sourceEl.textContent = `Source: ${source}`;
    weatherCard.classList.remove("hidden");
    removeBtn.classList.toggle("hidden", !currentOverride);
  }

  // Update modal
  function openUpdateModal() {
    if (!currentWeather) return;
    updTemp.value = currentWeather.tempC;
    updHumidity.value = currentWeather.humidityPct;
    updWind.value = currentWeather.windKph;
    updPrecip.value = currentWeather.precipMm;
    updCondition.value = currentWeather.conditionText;
    updateModal.classList.remove("hidden");
  }

  function closeUpdateModal() {
    updateModal.classList.add("hidden");
  }

  updateBtn.addEventListener("click", openUpdateModal);
  cancelUpdate.addEventListener("click", closeUpdateModal);

  // Save override
  updateForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const offset =
      currentDateKey === "tomorrow" ? 1 : currentDateKey === "dayafter" ? 2 : 0;
    const dateString = getDateString(offset);

    const values = {
      tempC: parseFloat(updTemp.value),
      humidityPct: parseInt(updHumidity.value, 10),
      windKph: parseFloat(updWind.value),
      precipMm: parseFloat(updPrecip.value),
      conditionText: updCondition.value.trim(),
    };

    try {
      const resp = await fetch("/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userEmail,
          lat: String(locationData.lat),
          lon: String(locationData.lon),
          date: dateString,
          values,
        }),
      });
      if (!resp.ok) throw new Error("Failed to save override");
      await resp.json();
      closeUpdateModal();
      loadWeather(currentDateKey);
    } catch (err) {
      showStatus(err.message || "Error saving override", "error");
    }
  });

  // Remove override
  removeBtn.addEventListener("click", async () => {
    const offset =
      currentDateKey === "tomorrow" ? 1 : currentDateKey === "dayafter" ? 2 : 0;
    const dateString = getDateString(offset);

    try {
      const resp = await fetch("/override", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userEmail,
          lat: String(locationData.lat),
          lon: String(locationData.lon),
          date: dateString,
        }),
      });
      if (!resp.ok) throw new Error("Failed to remove override");
      await resp.json();
      loadWeather(currentDateKey);
    } catch (err) {
      showStatus(err.message || "Error removing override", "error");
    }
  });

  todayBtn.addEventListener("click", () => loadWeather("today"));
  tomorrowBtn.addEventListener("click", () => loadWeather("tomorrow"));
  dayafterBtn.addEventListener("click", () => loadWeather("dayafter"));

  // Initialize
  if (initUser()) {
    initLocation();
    loadWeather("today");
  }
})();  