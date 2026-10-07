let selectedVehicleTier = null;
let currentDestinationSummary = '';
let dynamicEconomyPrice = "$18.00";
let dynamicComfortPrice = "$28.00";
let numericEcoVal = 18;
let numericComfVal = 28;
let promoDiscountApplied = 0;

let destinationPickerMap = null;
let activeTripMap = null;
let destPinMarker = null;
let driverMarker = null;
let currentRating = 0;
let driverBadReviewsCount = parseInt(localStorage.getItem('driver_bad_reviews') || '0');
let tripSimulationInterval = null;
let dispatchTimerInterval = null;
let dispatchCountdown = 15;

let adminTotalRevenue = parseInt(localStorage.getItem('admin_rev') || '142');
let adminTotalCommission = parseInt(localStorage.getItem('admin_comm') || '21');
let adminTotalPayout = parseInt(localStorage.getItem('admin_payout') || '121');
let adminLostLogs = JSON.parse(localStorage.getItem('admin_lost_logs') || '[]');
let driverLedgerHistory = JSON.parse(localStorage.getItem('driver_ledger') || '[]');

let pickupLat = 25.0343;
let pickupLng = -77.3963;
let currentCalculatedMiles = 3.5;

document.addEventListener("DOMContentLoaded", function() {
  calculateRealtimeFare();
  renderDriverLedger();
});

function clearAllTimers() {
  if (tripSimulationInterval) {
    clearInterval(tripSimulationInterval);
    tripSimulationInterval = null;
  }
  if (dispatchTimerInterval) {
    clearInterval(dispatchTimerInterval);
    dispatchTimerInterval = null;
  }
}

function openAdminPortal() {
  switchView('admin-login-view');
}

function verifyAdminLogin() {
  const code = document.getElementById('admin-passcode').value;
  if (code === 'Luxe$2020$') {
    document.getElementById('admin-passcode').value = '';
    updateAdminDashboardStats();
    switchView('admin-dashboard-view');
  } else {
    alert('❌ Incorrect admin passcode.');
  }
}

function updateAdminDashboardStats() {
  document.getElementById('admin-total-rev').innerText = `$${adminTotalRevenue}.00`;
  document.getElementById('admin-total-comm').innerText = `$${adminTotalCommission}.00`;
  document.getElementById('admin-total-payout').innerText = `$${adminTotalPayout}.00`;
  document.getElementById('admin-bad-reviews-display').innerText = driverBadReviewsCount;

  const logContainer = document.getElementById('admin-lost-log');
  if (adminLostLogs.length > 0) {
    logContainer.innerHTML = adminLostLogs.map((item, idx) => `<p style="margin: 0 0 6px 0; border-bottom: 1px solid rgba(197,160,89,0.2); padding-bottom: 4px;">#${idx+1}: ${item}</p>`).join('');
  } else {
    logContainer.innerHTML = "No active lost item reports currently logged.";
  }
}

function resetDriverStrikes() {
  driverBadReviewsCount = 0;
  localStorage.setItem('driver_bad_reviews', '0');
  alert('✔ Driver bad reviews reset to 0. Any active bans have been lifted.');
  updateAdminDashboardStats();
}

function switchView(viewId) {
  clearAllTimers();

  document.getElementById('landing-view').style.display = 'none';
  document.getElementById('admin-login-view').style.display = 'none';
  document.getElementById('admin-dashboard-view').style.display = 'none';
  document.getElementById('rider-destination-view').style.display = 'none';
  document.getElementById('rider-tier-view').style.display = 'none';
  document.getElementById('driver-dispatch-view').style.display = 'none';
  document.getElementById('rider-tracking-view').style.display = 'none';
  document.getElementById('rider-feedback-view').style.display = 'none';
  document.getElementById('driver-view').style.display = 'none';
  
  document.getElementById(viewId).style.display = viewId === 'landing-view' ? 'flex' : 'block';
  window.scrollTo(0, 0);

  if (viewId === 'rider-destination-view') {
    setTimeout(initDestinationPickerMap, 200);
  } else if (viewId === 'driver-dispatch-view') {
    startDispatchQueueTimer();
  } else if (viewId === 'rider-tracking-view') {
    setTimeout(initActiveTripMap, 200);
  }
}

function initDestinationPickerMap() {
  const container = document.getElementById('destination-picker-map');
  if (!container) return;

  if (!destinationPickerMap) {
    destinationPickerMap = L.map('destination-picker-map').setView([pickupLat, pickupLng], 12);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(destinationPickerMap);

    destinationPickerMap.on('click', function(e) {
      const lat = e.latlng.lat;
      const lng = e.latlng.lng;
      
      if (destPinMarker) {
        destinationPickerMap.removeLayer(destPinMarker);
      }
      
      destPinMarker = L.marker([lat, lng]).addTo(destinationPickerMap)
        .bindPopup('Dropped Pin Drop-off').openPopup();

      currentCalculatedMiles = calculateDistanceMiles(pickupLat, pickupLng, lat, lng);
      
      const stopInputs = document.querySelectorAll('.stop-input');
      if (stopInputs.length > 0) {
        stopInputs[0].value = `Dropped Pin (${currentCalculatedMiles.toFixed(1)} miles away)`;
      }
      calculateRealtimeFare();
    });
  } else {
    destinationPickerMap.invalidateSize();
  }
}

function useCurrentLocationGPS() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function(position) {
      pickupLat = position.coords.latitude;
      pickupLng = position.coords.longitude;
      document.getElementById('pickup-loc').value = `GPS Location (${pickupLat.toFixed(4)}, ${pickupLng.toFixed(4)})`;
      alert('📍 Your current GPS location has been successfully set as the pickup point!');
      calculateRealtimeFare();
    }, function(error) {
      alert('Unable to retrieve your location via GPS. Please check permissions.');
    });
  } else {
    alert('Geolocation is not supported by your browser.');
  }
}

function addStopField() {
  const container = document.getElementById('stops-container');
  const inputCount = container.querySelectorAll('.stop-input').length + 1;
  
  const newInput = document.createElement('input');
  newInput.type = 'text';
  newInput.className = 'stop-input';
  newInput.placeholder = `Stop #${inputCount} address or landmark...`;
  newInput.setAttribute('oninput', 'calculateRealtimeFare()');
  
  container.appendChild(newInput);
  calculateRealtimeFare();
}

function calculateDistanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

function applyPromoCode() {
  const code = document.getElementById('promo-code-input').value.trim().toUpperCase();
  if (code === 'BAHAMAS2026') {
    promoDiscountApplied = 5.00;
    alert('🎉 Promo code applied successfully! $5.00 discount will be deducted from your fare.');
    calculateRealtimeFare();
  } else {
    alert('❌ Invalid promo code.');
  }
}

function calculateRealtimeFare() {
  const box = document.getElementById('fare-estimate-box');
  const textElem = document.getElementById('estimated-fare-text');
  const badgeElem = document.getElementById('applied-surge-badge');
  
  const stopInputs = document.querySelectorAll('.stop-input');
  let totalStopsCount = 0;
  let combinedStopsText = [];
  
  stopInputs.forEach(input => {
    if (input.value.trim() !== "") {
      totalStopsCount++;
      combinedStopsText.push(input.value.trim());
    }
  });

  currentDestinationSummary = combinedStopsText.join(" ➔ Stop: ");
  let effectiveMiles = currentCalculatedMiles + ((totalStopsCount > 1 ? totalStopsCount - 1 : 0) * 2.0);

  let baseEco = 8.00 + (effectiveMiles * 4.75) - promoDiscountApplied;
  let baseComf = (8.00 + (effectiveMiles * 4.75)) * 1.4 - promoDiscountApplied;

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const timeDecimal = currentHour + (currentMinute / 60);
  const dayOfWeek = now.getDay();

  let multiplier = 1.0;
  let badgeText = "";

  if ((timeDecimal >= 7.0 && timeDecimal <= 9.5) || (timeDecimal >= 16.0 && timeDecimal <= 18.5)) {
    multiplier = 1.08;
    badgeText = "⚡ Rush Hour Surge Applied (+8%)";
  } else if (dayOfWeek === 0 || dayOfWeek === 6) {
    multiplier = 0.95;
    badgeText = "🌴 Weekend Special Promo Applied (5% Off)";
  } else {
    multiplier = 0.97;
    badgeText = "✨ Standard Off-Peak Rate (3% Off)";
  }

  numericEcoVal = Math.max(Math.round(baseEco * multiplier), 8);
  numericComfVal = Math.max(Math.round(baseComf * multiplier), 12);

  dynamicEconomyPrice = `$${numericEcoVal}.00`;
  dynamicComfortPrice = `$${numericComfVal}.00`;

  if (combinedStopsText.length > 0 && textElem && badgeElem && box) {
    textElem.innerText = `Economy: ${dynamicEconomyPrice}  |  Comfort: ${dynamicComfortPrice}`;
    badgeElem.innerText = badgeText + (promoDiscountApplied > 0 ? " | $5 Promo Deducted" : "");
    box.style.display = 'block';
  } else if (box) {
    box.style.display = 'none';
  }
}

function proceedToRideSelection() {
  if (!currentDestinationSummary) {
    alert('Please enter at least one drop-off stop or pin on the map.');
    return;
  }
  const ccNum = document.getElementById('cc-num').value;
  if (!ccNum) {
    alert('Please enter valid credit card details for escrow hold.');
    return;
  }

  document.getElementById('dest-display').innerText = "Route Stops: " + currentDestinationSummary;
  document.getElementById('tier-fare-summary').innerText = `Funds secured in escrow. Payout releases to driver only after rating is submitted.`;
  
  document.getElementById('eco-label').innerText = `RideFlow Economy (${dynamicEconomyPrice})`;
  document.getElementById('comf-label').innerText = `RideFlow Comfort (${dynamicComfortPrice})`;
  
  switchView('rider-tier-view');
}

function selectTier(element, tierName, price, numericPrice) {
  document.querySelectorAll('.tier-option').forEach(el => el.classList.remove('selected'));
  element.classList.add('selected');
  selectedVehicleTier = { tierName, price, numericPrice };
}

function confirmRideRequest() {
  if (!selectedVehicleTier) {
    alert('Please select a vehicle tier.');
    return;
  }
  alert(`Escrow authorized (${selectedVehicleTier.price} for ${selectedVehicleTier.tierName}). Funds secured. Broadcasting to nearby drivers...`);
  document.getElementById('dispatch-details').innerText = `${selectedVehicleTier.tierName} trip to: ${currentDestinationSummary} (${selectedVehicleTier.price})`;
  switchView('driver-dispatch-view');
}

function startDispatchQueueTimer() {
  dispatchCountdown = 15;
  const timerEl = document.getElementById('countdown-timer');
  if (timerEl) timerEl.innerText = dispatchCountdown;

  if (dispatchTimerInterval) clearInterval(dispatchTimerInterval);

  dispatchTimerInterval = setInterval(() => {
    dispatchCountdown--;
    if (timerEl) timerEl.innerText = dispatchCountdown;
    if (dispatchCountdown <= 0) {
      clearInterval(dispatchTimerInterval);
      dispatchTimerInterval = null;
      alert('⏳ No drivers accepted within the time limit. Retrying broadcast queue...');
      switchView('rider-destination-view');
    }
  }, 1000);
}

function driverAcceptRide() {
  if (dispatchTimerInterval) {
    clearInterval(dispatchTimerInterval);
    dispatchTimerInterval = null;
  }
  alert('✅ Driver Marcus Miller accepted your request! Dispatching live tracking...');
  switchView('rider-tracking-view');
}

function initActiveTripMap() {
  const container = document.getElementById('active-trip-map');
  if (!container) return;

  if (!activeTripMap) {
    activeTripMap = L.map('active-trip-map').setView([pickupLat, pickupLng], 14);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(activeTripMap);

    let driverLat = pickupLat + 0.005;
    let driverLng = pickupLng + 0.005;

    driverMarker = L.marker([driverLat, driverLng]).addTo(activeTripMap)
      .bindPopup('<b>Driver:</b> Marcus Miller (En Route)')
      .openPopup();

    if (tripSimulationInterval) clearInterval(tripSimulationInterval);
    tripSimulationInterval = setInterval(() => {
      driverLat -= 0.0008;
      driverLng -= 0.0008;
      driverMarker.setLatLng([driverLat, driverLng]);
    }, 2000);
  } else {
    activeTripMap.invalidateSize();
  }
}

function arriveAtDestination() {
  if (tripSimulationInterval) {
    clearInterval(tripSimulationInterval);
    tripSimulationInterval = null;
  }
  alert('📍 Arrived at destination! Please rate your driver to release funds from escrow.');
  switchView('rider-feedback-view');
}

function setRating(stars) {
  currentRating = stars;
  const starElements = document.querySelectorAll('.star');
  starElements.forEach((el, index) => {
    if (index < stars) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });
}

function reportLostItem() {
  const itemDesc = document.getElementById('lost-item-desc').value;
  if (!itemDesc) {
    alert('Please describe the item you left behind.');
    return;
  }
  
  adminLostLogs.push(`Vehicle E-12948 (Marcus Miller): "${itemDesc}"`);
  localStorage.setItem('admin_lost_logs', JSON.stringify(adminLostLogs));

  alert(`📱 [SMS Dispatched to Administrator]: Lost item reported for vehicle E-12948 (Marcus Miller). Item: "${itemDesc}".`);
  document.getElementById('lost-item-desc').value = '';
}

function submitRatingAndFinish() {
  if (currentRating === 0) {
    alert('Please select a star rating for your driver before submitting.');
    return;
  }

  const totalFare = selectedVehicleTier ? selectedVehicleTier.numericPrice : 18;
  const adminFee = totalFare >= 25 ? 4.00 : 3.00;
  const driverNetPayout = totalFare - adminFee;

  adminTotalRevenue += totalFare;
  adminTotalCommission += adminFee;
  adminTotalPayout += driverNetPayout;

  localStorage.setItem('admin_rev', adminTotalRevenue);
  localStorage.setItem('admin_comm', adminTotalCommission);
  localStorage.setItem('admin_payout', adminTotalPayout);

  const refCode = `REF-${Math.floor(1000 + Math.random() * 9000)}`;
  driverLedgerHistory.unshift(`[${refCode}]: Trip Completed - Earned $${driverNetPayout.toFixed(2)} (Deposited to RBC •••4829)`);
  localStorage.setItem('driver_ledger', JSON.stringify(driverLedgerHistory));
  renderDriverLedger();

  if (currentRating <= 2) {
    driverBadReviewsCount++;
    localStorage.setItem('driver_bad_reviews', driverBadReviewsCount);
  }

  alert(`⭐ Rating submitted successfully!\n\n• Total Fare: $${totalFare}.00\n• Driver Payout: $${driverNetPayout.toFixed(2)} deposited.`);

  currentRating = 0;
  setRating(0);
  switchView('landing-view');
}

function renderDriverLedger() {
  const ledgerContainer = document.getElementById('driver-ledger-log');
  if (ledgerContainer && driverLedgerHistory.length > 0) {
    ledgerContainer.innerHTML = driverLedgerHistory.map(entry => `<p style="margin: 0 0 4px 0; color: #48bb78;">${entry}</p>`).join('');
  }
}

function cancelRide() {
  if (confirm('Cancel Ride Warning: A $9.00 cancellation fee will be charged to your card on file.')) {
    alert('Ride canceled.');
    switchView('landing-view');
  }
}

function updateFileName(inputId, statusId) {
  const fileInput = document.getElementById(inputId);
  const statusText = document.getElementById(statusId);
  if (fileInput.files.length > 0) {
    statusText.innerText = "Selected: " + fileInput.files[0].name;
    statusText.style.color = "#48bb78";
  }
}

function submitCredentials() {
  const bankName = document.getElementById('bank-name').value;
  const bankAcc = document.getElementById('bank-acc-num').value;
  const bankRouting = document.getElementById('bank-routing').value;
  const driverCc = document.getElementById('driver-cc-num').value;

  if (!bankAcc || !bankRouting) {
    alert('Please provide your bank account number and branch routing code.');
    return;
  }
  if (!driverCc) {
    alert('Please enter payment details for the registration fee.');
    return;
  }
  
  alert(`$75.00 fee processed! Bank account linked to ${bankName}. Driver status: ACTIVE.`);
  switchView('landing-view');
}
