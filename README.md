# 🌿 EcoVia – Green Travel Route Planner  

EcoVia is a modern **Flask-based web application** that promotes **sustainable travel** by offering eco-friendly route planning with **real-time charging station information** and **CO₂ emissions tracking**.  
Built with a **nature-inspired UI**, EcoVia combines environmental awareness with modern web technology.  

![EcoVia Demo](static/images/favicon.svg)

---

## ✨ Features  

- 🚶‍♂️ **Multi-modal Route Planning**  
  - Walking, Cycling, and EV Driving options  
  - Real-time route details (distance, duration, coordinates)  

- 🌍 **CO₂ Emissions Calculator**  
  - ICE Car baseline: `192g CO₂/km`  
  - EV emissions: `50g CO₂/km`  
  - Walking & Cycling: `0g CO₂/km`  
  - Calculates emissions + savings vs. ICE vehicles  

- 🔋 **EV Charging Station Integration**  
  - Fetches nearby stations within a 10km radius  
  - Displays power rating, connector type, operator, costs, and availability  

- 🗺️ **Interactive Map Interface**  
  - Built with **Leaflet.js** + **OpenStreetMap**  
  - Custom route visualization  
  - Click-to-select start/end points + charging stations  

- 🎨 **Nature-Inspired Design**  
  - Glass-morphism effects  
  - Dark theme with green accents  
  - Floating leaf/orb animations  
  - Fully responsive & accessible UI  

---

## 🛠️ Tech Stack  

**Frontend**  
- HTML5, CSS3 (Glass-morphism + custom animations)  
- Vanilla JavaScript  
- Leaflet.js (Maps)  

**Backend**  
- Flask (Python)  
- OpenRouteService API (Geocoding & Routing)  
- OpenChargeMap API (EV Stations)  
- python-dotenv, requests  

---


## 🚀 Getting Started  
### Installation

1. **Clone the Repository**  
   ```bash
   git clone https://github.com/TEJAS-G0WDA/EcoVia.git
   cd EcoVia
   ```

2.**Create Virtual Environment**
  ```bash
  python -m venv venv
  source venv/bin/activate    # On Linux/Mac
  venv\Scripts\activate       # On Windows
  ```

3.**Install Dependencies**
  ```bash
  pip install -r requirements.txt
  ```
4.**Run the App**
```bash
flask run
```

5.**Open in browser:** `http://127.0.0.1:5000`

## 📸 Screenshots

🌱 ![EcoVia Demo](static/images/favicon.svg)




## 📂 Project Structure  
```
EcoVia/
├── app.py # Main Flask application
├── requirements.txt # Dependencies
├── templates/ # HTML templates
│ ├── landing.html # Landing page
│ └── index.html # Planning page
├── static/ # Static assets
│ ├── images/ # Image assets
│ ├── css/ # Stylesheets
│ └── js/ # JavaScript files
└── venv/ # Virtual environment (excluded in .gitignore)
```
