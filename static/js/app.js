let map, routeLayer, stationLayer;
let startMarker = null;
let endMarker = null;
let pickingMode = null; // 'start' | 'end' | null

function svgPin(color){
	return `
	<svg viewBox="0 0 24 24" width="28" height="28" xmlns="http://www.w3.org/2000/svg">
		<path fill="${color}" d="M12 2C8.134 2 5 5.134 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.866-3.134-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"/>
	</svg>`;
}
function createStartIcon(){
	return L.divIcon({
		className: 'pick-pin-start',
		html: svgPin('#22c55e'),
		iconSize: [28,28],
		iconAnchor: [14,24]
	});
}
function createEndIcon(){
	return L.divIcon({
		className: 'pick-pin-end',
		html: svgPin('#ff3b3b'),
		iconSize: [28,28],
		iconAnchor: [14,24]
	});
}

function initMap(){
	map = L.map('map', { zoomControl: true });
	L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
		maxZoom: 19,
		attribution: '&copy; OpenStreetMap contributors'
	}).addTo(map);
	// Bengaluru, India
	map.setView([12.9716, 77.5946], 12);

	routeLayer = L.layerGroup().addTo(map);
	stationLayer = L.layerGroup().addTo(map);

	// click handler for picking points
	map.on('click', (e)=>{
		if(!pickingMode) return;
		const { lat, lng } = e.latlng;
		if(pickingMode === 'start'){
			if(startMarker){ startMarker.setLatLng([lat,lng]); startMarker.setIcon(createStartIcon()); }
			else{
				startMarker = L.marker([lat,lng], { draggable:true, icon: createStartIcon() }).addTo(map);
				startMarker.on('dragend', ()=>{
					const p = startMarker.getLatLng();
					applyPicked('start', p.lat, p.lng);
				});
			}
			applyPicked('start', lat, lng);
		}else if(pickingMode === 'end'){
			if(endMarker){ endMarker.setLatLng([lat,lng]); endMarker.setIcon(createEndIcon()); }
			else{
				endMarker = L.marker([lat,lng], { draggable:true, icon: createEndIcon() }).addTo(map);
				endMarker.on('dragend', ()=>{
					const p = endMarker.getLatLng();
					applyPicked('end', p.lat, p.lng);
				});
			}
			applyPicked('end', lat, lng);
		}
		pickingMode = null;
	});
}

function applyPicked(kind, lat, lon){
	if(kind === 'start'){
		document.getElementById('startInput').dataset.lat = lat;
		document.getElementById('startInput').dataset.lon = lon;
		document.getElementById('startInput').value = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
	}else if(kind === 'end'){
		document.getElementById('endInput').dataset.lat = lat;
		document.getElementById('endInput').dataset.lon = lon;
		document.getElementById('endInput').value = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
	}
}

function resetPlanner(){
	// clear inputs and suggestions
	const startInput = document.getElementById('startInput');
	const endInput = document.getElementById('endInput');
	startInput.value = '';
	endInput.value = '';
	startInput.removeAttribute('data-lat');
	startInput.removeAttribute('data-lon');
	endInput.removeAttribute('data-lat');
	endInput.removeAttribute('data-lon');
	document.getElementById('startSuggest').innerHTML = '';
	document.getElementById('endSuggest').innerHTML = '';

	// reset stats
	document.getElementById('statDistance').textContent = '-';
	document.getElementById('statDuration').textContent = '-';
	document.getElementById('statCO2').textContent = '-';
	document.getElementById('statCO2Save').textContent = '-';

	// clear map layers and markers
	routeLayer.clearLayers();
	stationLayer.clearLayers();
	if(startMarker){ map.removeLayer(startMarker); startMarker = null; }
	if(endMarker){ map.removeLayer(endMarker); endMarker = null; }

	// recenter map to default view
	map.setView([12.9716, 77.5946], 12);
}

function setTheme(light){
	if(light){
		document.documentElement.classList.add('light');
	}else{
		document.documentElement.classList.remove('light');
	}
	localStorage.setItem('theme', light ? 'light' : 'dark');
}

function toggleTheme(){
	const isLight = document.documentElement.classList.contains('light');
	setTheme(!isLight);
}

function formatDuration(seconds){
	const s = Math.round(seconds);
	const h = Math.floor(s/3600);
	const m = Math.floor((s%3600)/60);
	if(h>0) return `${h}h ${m}m`;
	return `${m}m`;
}

function showLoader(show){
	document.getElementById('loader').classList.toggle('hidden', !show);
}

function debounce(fn, delay){
	let t; return (...args)=>{ clearTimeout(t); t = setTimeout(()=>fn(...args), delay); };
}

async function fetchSuggestions(q){
	if(!q || q.length < 3) return [];
	const url = `/api/geocode?q=${encodeURIComponent(q)}`;
	const resp = await fetch(url);
	if(!resp.ok) return [];
	const data = await resp.json();
	return data.suggestions || [];
}

function bindAutocomplete(inputEl, suggestBox){
	const render = (items)=>{
		suggestBox.innerHTML = '';
		if(items.length === 0){ return; }
		const wrap = document.createElement('div');
		wrap.className = 'item';
		items.forEach(s => {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.textContent = s.label || `${s.lat}, ${s.lon}`;
			btn.addEventListener('click', ()=>{
				inputEl.value = s.label || `${s.lat}, ${s.lon}`;
				suggestBox.innerHTML = '';
				inputEl.dataset.lat = s.lat;
				inputEl.dataset.lon = s.lon;
			});
			wrap.appendChild(btn);
		});
		suggestBox.appendChild(wrap);
	};

	const handler = debounce(async ()=>{
		const items = await fetchSuggestions(inputEl.value.trim());
		render(items);
	}, 300);

	inputEl.addEventListener('input', handler);
	inputEl.addEventListener('blur', ()=> setTimeout(()=> suggestBox.innerHTML='', 200));
}

async function fetchRoute(start, end, mode){
	const resp = await fetch('/api/route', {
		method: 'POST', headers: {'Content-Type':'application/json'},
		body: JSON.stringify({ start, end, mode })
	});
	const data = await resp.json();
	if(!resp.ok) throw new Error(data.error || 'Route error');
	return data;
}

async function fetchStations(lat, lon, distanceKm=10){
	const url = `/api/charging-stations?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&distance_km=${encodeURIComponent(distanceKm)}`;
	try{
		const resp = await fetch(url);
		const data = await resp.json();
		if(!resp.ok){
			console.warn('Stations fetch failed', data);
			return [];
		}
		if(data.warning){ console.warn(data.warning); }
		return data.stations || [];
	}catch(err){
		console.warn('Stations fetch error', err);
		return [];
	}
}

function drawRoute(coords){
	routeLayer.clearLayers();
	if(!coords || coords.length === 0) return;
	const poly = L.polyline(coords, { color:'#22c55e', weight:6, opacity:0.9 });
	poly.addTo(routeLayer);
	map.fitBounds(poly.getBounds(), { padding:[20,20] });
}

function markerForStation(st){
	const icon = L.divIcon({
		className: 'ev-pin',
		html: '⚡',
		iconSize: [24,24],
		iconAnchor: [12,12]
	});
	const m = L.marker([st.lat, st.lon], { icon });
	const conns = (st.connections||[]).map(c=>{
		const power = c.powerKW ? `${c.powerKW} kW` : 'n/a';
		const type = c.connectionType || '—';
		return `${power} · ${type}`;
	}).join('<br/>');
	const popup = `
		<b>${st.name || 'Charging Station'}</b><br/>
		${st.address || ''}<br/>
		${st.operator ? `Operator: ${st.operator}<br/>` : ''}
		${st.usage_cost ? `Cost: ${st.usage_cost}<br/>` : ''}
		${conns}
	`;
	m.bindPopup(popup);
	return m;
}

function drawStations(stations){
	stationLayer.clearLayers();
	stations.forEach(st => {
		if(st.lat && st.lon){
			markerForStation(st).addTo(stationLayer);
		}
	});
}

function animateValue(el, from, to, duration, formatter){
	const start = performance.now();
	function frame(now){
		const t = Math.min(1, (now - start)/duration);
		const v = from + (to - from) * (1 - Math.cos(Math.PI*t))/2; // easeOutCosine
		el.textContent = formatter(v);
		if(t < 1) requestAnimationFrame(frame);
	}
	requestAnimationFrame(frame);
}

function updateStats(distM, durS, co2Kg, saveKg){
	const distEl = document.getElementById('statDistance');
	const durEl = document.getElementById('statDuration');
	const co2El = document.getElementById('statCO2');
	const saveEl = document.getElementById('statCO2Save');
	const prevDist = parseFloat((distEl.textContent||'0').replace(/[^\d.]/g,'')) || 0;
	const prevCO2 = parseFloat((co2El.textContent||'0').replace(/[^\d.]/g,'')) || 0;
	const prevSave = parseFloat((saveEl.textContent||'0').replace(/[^\d.]/g,'')) || 0;
	animateValue(distEl, prevDist, distM/1000, 700, v => `${v.toFixed(2)} km`);
	durEl.textContent = formatDuration(durS);
	animateValue(co2El, prevCO2, co2Kg, 700, v => `${v.toFixed(3)} kg`);
	animateValue(saveEl, prevSave, saveKg, 700, v => `${v.toFixed(3)} kg`);
}

function midpoint(coords){
	if(!coords || coords.length===0) return null;
	return coords[Math.floor(coords.length/2)];
}

async function onFindRoute(){
	const start = document.getElementById('startInput').value.trim();
	const end = document.getElementById('endInput').value.trim();
	const mode = document.getElementById('modeSelect').value;
	const sLat = parseFloat(document.getElementById('startInput').dataset.lat || '');
	const sLon = parseFloat(document.getElementById('startInput').dataset.lon || '');
	const eLat = parseFloat(document.getElementById('endInput').dataset.lat || '');
	const eLon = parseFloat(document.getElementById('endInput').dataset.lon || '');
	if((!start || !end) && (isNaN(sLat) || isNaN(sLon) || isNaN(eLat) || isNaN(eLon))){
		alert('Please provide start and destination by typing or picking on the map');
		return;
	}
	showLoader(true);
	try{
		const payloadStart = (!isNaN(sLat) && !isNaN(sLon)) ? { lat: sLat, lon: sLon } : start;
		const payloadEnd = (!isNaN(eLat) && !isNaN(eLon)) ? { lat: eLat, lon: eLon } : end;
		const data = await fetchRoute(payloadStart, payloadEnd, mode);
		drawRoute(data.coordinates);
		updateStats(data.distance_m, data.duration_s, data.co2_kg, data.co2_savings_kg);
		const mid = midpoint(data.coordinates);
		if(mid){
			const stations = await fetchStations(mid[0], mid[1], 10);
			drawStations(stations);
		}
	}catch(err){
		console.error(err);
		alert(err.message || 'Failed to find route');
	}finally{
		showLoader(false);
	}
}

function initUI(){
	const startInput = document.getElementById('startInput');
	const endInput = document.getElementById('endInput');
	bindAutocomplete(startInput, document.getElementById('startSuggest'));
	bindAutocomplete(endInput, document.getElementById('endSuggest'));
	
	document.getElementById('routeBtn').addEventListener('click', onFindRoute);
	const resetBtn = document.getElementById('resetBtn');
	if(resetBtn){ resetBtn.addEventListener('click', resetPlanner); }
	document.getElementById('themeToggle').addEventListener('click', toggleTheme);

	const saved = localStorage.getItem('theme');
	setTheme(saved === 'light');

	// map pick buttons
	const pickStartBtn = document.getElementById('pickStartBtn');
	const pickEndBtn = document.getElementById('pickEndBtn');
	if(pickStartBtn){ pickStartBtn.addEventListener('click', ()=>{ pickingMode = 'start'; }); }
	if(pickEndBtn){ pickEndBtn.addEventListener('click', ()=>{ pickingMode = 'end'; }); }
}

window.addEventListener('DOMContentLoaded', ()=>{
	initMap();
	initUI();
}); 