import os
import math
import time
from typing import Dict, Any, List, Optional, Tuple

from flask import Flask, jsonify, render_template, request
from dotenv import load_dotenv
import requests
import openrouteservice
from urllib.parse import urlencode


load_dotenv()

ORS_API_KEY = os.getenv("ORS_API_KEY")
OCM_API_KEY = os.getenv("OCM_API_KEY") or os.getenv("OPENCHARGEMAP_API_KEY")

app = Flask(__name__, template_folder="templates", static_folder="static")


def require_api_key_present() -> Optional[str]:
	missing = []
	if not ORS_API_KEY:
		missing.append("ORS_API_KEY")
	if missing:
		return f"Missing required API keys: {', '.join(missing)}. Please set them in your .env file."
	return None


def ors_geocode_single(query: str) -> Optional[Tuple[float, float]]:
	"""Return (lon, lat) for the best match using OpenRouteService geocoding."""
	if not ORS_API_KEY:
		return None
	url = "https://api.openrouteservice.org/geocode/search"
	params = {"api_key": ORS_API_KEY, "text": query, "size": 1}
	resp = requests.get(url, params=params, timeout=20)
	if not resp.ok:
		return None
	data = resp.json()
	features = data.get("features", [])
	if not features:
		return None
	coords = features[0]["geometry"]["coordinates"]
	return float(coords[0]), float(coords[1])


def convert_route_coords_lonlat_to_latlon(coordinates: List[List[float]]) -> List[List[float]]:
	return [[pt[1], pt[0]] for pt in coordinates]


def estimate_co2_savings(distance_meters: float, mode: str) -> Dict[str, float]:
	"""Estimate CO2 emissions and savings in kilograms.

	Assumptions (coarse):
	- ICE car: 192 g CO2/km
	- EV car: 50 g CO2/km
	- Walking/Cycling: 0 g CO2/km
	"""
	distance_km = distance_meters / 1000.0
	ice_g_per_km = 192.0
	ev_g_per_km = 50.0

	if mode == "walk" or mode == "cycle":
		route_emissions_g = 0.0
		savings_g = ice_g_per_km * distance_km
	elif mode == "drive":
		# Treat drive as EV-preferred for savings calculation
		route_emissions_g = ev_g_per_km * distance_km
		savings_g = (ice_g_per_km - ev_g_per_km) * distance_km
	else:
		# Fallback: no savings
		route_emissions_g = 0.0
		savings_g = 0.0

	return {
		"co2_kg": round(route_emissions_g / 1000.0, 3),
		"co2_savings_kg": round(savings_g / 1000.0, 3),
	}


@app.route("/")
def landing():
	return render_template("landing.html")


@app.route("/plan")
def planner():
	return render_template("index.html")


@app.route("/api/geocode")
def geocode_api():
	query = request.args.get("q", "").strip()
	if not query:
		return jsonify({"error": "Missing 'q' parameter"}), 400
	if not ORS_API_KEY:
		return jsonify({"error": "Server missing ORS_API_KEY"}), 500

	url = "https://api.openrouteservice.org/geocode/autocomplete"
	params = {"api_key": ORS_API_KEY, "text": query, "size": 5}
	resp = requests.get(url, params=params, timeout=20)
	if not resp.ok:
		return jsonify({"error": "Geocoding request failed"}), resp.status_code
	data = resp.json()
	suggestions = []
	for feature in data.get("features", []):
		props = feature.get("properties", {})
		geom = feature.get("geometry", {})
		coords = geom.get("coordinates", [])
		if len(coords) == 2:
			suggestions.append({
				"label": props.get("label"),
				"lon": coords[0],
				"lat": coords[1],
			})
	return jsonify({"suggestions": suggestions})


@app.route("/api/route", methods=["POST"])
def route_api():
	missing_keys_error = require_api_key_present()
	if missing_keys_error:
		return jsonify({"error": missing_keys_error}), 500

	try:
		payload = request.get_json(force=True) or {}
		start_raw = payload.get("start")
		end_raw = payload.get("end")
		mode = str(payload.get("mode", "walk")).strip().lower()

		profile_map = {
			"walk": "foot-walking",
			"cycle": "cycling-regular",
			"drive": "driving-car",
		}
		profile = profile_map.get(mode)
		if not profile:
			return jsonify({"error": "Invalid mode. Use 'walk', 'cycle', or 'drive'"}), 400

		# Determine coordinates: support {lat, lon} or text requiring geocode
		start_lonlat = None
		end_lonlat = None
		if isinstance(start_raw, dict) and "lat" in start_raw and "lon" in start_raw:
			start_lonlat = (float(start_raw["lon"]), float(start_raw["lat"]))
		elif isinstance(start_raw, str) and start_raw.strip():
			start_lonlat = ors_geocode_single(start_raw.strip())

		if isinstance(end_raw, dict) and "lat" in end_raw and "lon" in end_raw:
			end_lonlat = (float(end_raw["lon"]), float(end_raw["lat"]))
		elif isinstance(end_raw, str) and end_raw.strip():
			end_lonlat = ors_geocode_single(end_raw.strip())

		if not start_lonlat or not end_lonlat:
			return jsonify({"error": "Provide valid start and end as text or {lat, lon}"}), 400

		client = openrouteservice.Client(key=ORS_API_KEY)
		res = client.directions(
			coordinates=[list(start_lonlat), list(end_lonlat)],
			profile=profile,
			format="geojson",
		)

		feature = res["features"][0]
		geometry = feature["geometry"]
		coordinates_lonlat = geometry["coordinates"]
		coordinates_latlon = convert_route_coords_lonlat_to_latlon(coordinates_lonlat)
		summary = feature["properties"]["summary"]
		distance_m = float(summary.get("distance", 0.0))
		duration_s = float(summary.get("duration", 0.0))

		co2 = estimate_co2_savings(distance_m, mode)

		return jsonify({
			"start": {"lat": start_lonlat[1], "lon": start_lonlat[0]},
			"end": {"lat": end_lonlat[1], "lon": end_lonlat[0]},
			"mode": mode,
			"distance_m": round(distance_m, 1),
			"duration_s": round(duration_s, 1),
			"co2_kg": co2["co2_kg"],
			"co2_savings_kg": co2["co2_savings_kg"],
			"coordinates": coordinates_latlon,
		}), 200

	except Exception as exc:
		return jsonify({"error": f"Unexpected server error: {exc}"}), 500


@app.route("/api/charging-stations")
def charging_stations_api():
	lat = request.args.get("lat")
	lon = request.args.get("lon")
	distance_km = request.args.get("distance_km", "10")
	try:
		lat_f = float(lat) if lat is not None else None
		lon_f = float(lon) if lon is not None else None
		dist_f = float(distance_km)
	except Exception:
		return jsonify({"error": "Invalid lat/lon/distance_km"}), 400

	if lat_f is None or lon_f is None:
		return jsonify({"error": "Missing lat or lon"}), 400

	params = {
		"output": "json",
		"latitude": lat_f,
		"longitude": lon_f,
		"distance": dist_f,
		"distanceunit": "KM",
		"maxresults": 50,
	}
	headers = {
		"User-Agent": "EcoVia/1.0 (+https://ecovia.local)",
		"Accept": "application/json",
	}
	if OCM_API_KEY:
		headers["X-API-Key"] = OCM_API_KEY
		params["key"] = OCM_API_KEY

	try:
		resp = requests.get("https://api.openchargemap.io/v3/poi/", params=params, headers=headers, timeout=30)
		if not resp.ok:
			return jsonify({"stations": [], "warning": "OpenChargeMap request failed"}), 200
		pois = resp.json()
	except Exception:
		return jsonify({"stations": [], "warning": "OpenChargeMap unavailable"}), 200

	results = []
	for poi in pois:
		addr = poi.get("AddressInfo", {})
		conn = poi.get("Connections", [])
		status = poi.get("StatusType", {})
		if not addr:
			continue
		results.append({
			"name": addr.get("Title"),
			"address": ", ".join(filter(None, [addr.get("AddressLine1"), addr.get("Town"), addr.get("StateOrProvince"), addr.get("Postcode"), addr.get("Country", {}).get("Title") if isinstance(addr.get("Country"), dict) else None])),
			"lat": addr.get("Latitude"),
			"lon": addr.get("Longitude"),
			"usage_cost": poi.get("UsageCost"),
			"operator": (poi.get("OperatorInfo", {}) or {}).get("Title"),
			"network": (poi.get("DataProvider", {}) or {}).get("Title"),
			"num_points": poi.get("NumberOfPoints"),
			"status": status.get("Title"),
			"connections": [
				{
					"powerKW": c.get("PowerKW"),
					"currentType": (c.get("CurrentType", {}) or {}).get("Title"),
					"connectionType": (c.get("ConnectionType", {}) or {}).get("Title"),
				}
				for c in conn
			],
		})

	return jsonify({"stations": results})


if __name__ == "__main__":
	app.run(debug=True)
 
 
 