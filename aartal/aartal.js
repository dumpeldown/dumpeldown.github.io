// Apply image size classes from data-size attribute (default: small)
(function(){
    document.querySelectorAll('.entry-gallery img').forEach(function(img){
        const size = (img.getAttribute('data-size') || 'small').toString().toLowerCase();
        const allowed = ['small','medium','large'];
        const cls = allowed.indexOf(size) !== -1 ? 'img-' + size : 'img-small';
        img.classList.add(cls);
    });
})();

// Support multiple GPX maps per page
document.querySelectorAll('.gpx-map').forEach(function(mapDiv, idx) {
    const gpxFile = mapDiv.getAttribute('data-gpx') || 'track.gpx';
    // Give each map a unique id for Leaflet
    const mapId = 'gpxmap_' + idx;
    mapDiv.id = mapId;
    // Create info element (next sibling)
    const infoDiv = mapDiv.parentNode.querySelector('.gpx-info');
    // Initialize map (scroll-wheel zoom disabled to avoid accidental zoom while scrolling the page)
    const map = L.map(mapId, { scrollWheelZoom: false }).setView([50.4, 8.3], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    let gpxLayer = null;
    function addGeoJSON(geojson) {
        if (gpxLayer) { map.removeLayer(gpxLayer); }
        gpxLayer = L.geoJSON(geojson, {
            style: { color: '#ff6700', weight: 4, opacity: 0.8 },
            pointToLayer: function (feature, latlng) {
                return L.circleMarker(latlng, { radius: 4, fillColor: '#ffffff', color: '#ff6700', weight:1, fillOpacity:1 });
            }
        }).addTo(map);
        try {
            map.fitBounds(gpxLayer.getBounds(), { padding: [20,20] });
        } catch (e) { console.warn('Could not fit bounds', e); }
    }
    // Load the GPX file specified in data-gpx
    fetch('./' + gpxFile).then(r => {
        if (!r.ok) throw new Error('no gpx');
        return r.text();
    }).then(text => {
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, 'application/xml');
        const gj = (window.toGeoJSON && window.toGeoJSON.gpx) ? window.toGeoJSON.gpx(xml) : (window.togeojson && window.togeojson.gpx) ? window.togeojson.gpx(xml) : null;
        if (!gj) { console.warn('toGeoJSON not available'); return; }
        addGeoJSON(gj);
        if (infoDiv) infoDiv.innerHTML = `Download the file: <a href="./${gpxFile}" download>${gpxFile}</a>.`;
    }).catch(()=>{
        if (infoDiv) infoDiv.innerHTML = `No GPX file <code>${gpxFile}</code> found in this folder.`;
    });

    // Add this inside your GPX map initialization function (after addGeoJSON)
    let highlightMarker = null;
    mapDiv.parentNode.querySelectorAll('.entry-gallery img[data-coord]').forEach(function(img) {
        img.style.cursor = 'pointer';
        img.addEventListener('click', function() {
            // hide helper note on first click
            const note = document.getElementById('first-photo-note');
            if (note) note.style.display = 'none';
            const coord = img.getAttribute('data-coord');
            if (!coord) return;
            const parts = coord.split(',').map(Number);
            if (parts.length < 2) return;
            const lat = parts[0], lon = parts[1];
            if (highlightMarker) { map.removeLayer(highlightMarker); }
            const altText = img.alt || img.getAttribute('data-popup') || 'Photo location';
            highlightMarker = L.marker([lat, lon], {
                icon: L.icon({
                    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41],
                    popupAnchor: [1, -34],
                    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
                    shadowSize: [41, 41],
                })
            }).addTo(map).bindPopup(altText).openPopup();
            map.setView([lat, lon], 15, { animate: true });
        });
    });
});

// Animated km counter logic: interpolate based on scroll position
const kmCounter = document.getElementById('km-counter-value');
function updateKmOnScroll() {
    const entries = Array.from(document.querySelectorAll('.entry'));
    let scrollY = window.scrollY || window.pageYOffset;
    let winH = window.innerHeight;
    let docH = document.body.scrollHeight;
    // Gather h2 positions and km values
    let h2s = [];
    for (let i = 0; i < entries.length; ++i) {
        const h2 = entries[i].querySelector('h2');
        if (!h2) continue;
        const rect = h2.getBoundingClientRect();
        const top = rect.top + scrollY;
        const km = parseFloat(entries[i].getAttribute('data-km')) || 0;
        h2s.push({top, km});
    }
    // If no articles, show 0
    if (h2s.length === 0) {
        kmCounter.textContent = '0.0';
        return;
    }
    // If above first h2, interpolate from 0 to first km
    if ((scrollY + winH/2) < h2s[0].top) {
        let percent = (scrollY === 0) ? 0 : Math.max(0, Math.min(1, (scrollY + winH/2) / h2s[0].top));
        let kmValue = h2s[0].km * percent;
        kmCounter.textContent = kmValue.toFixed(1);
        return;
    }
    // Otherwise, interpolate between articles as before
    let prevKm = h2s[0].km, prevH2 = h2s[0].top;
    let nextKm = h2s[0].km, nextH2 = h2s[0].top;
    for (let i = 1; i < h2s.length; ++i) {
        if ((scrollY + winH/2) < h2s[i].top) {
            nextKm = h2s[i].km;
            nextH2 = h2s[i].top;
            break;
        }
        prevKm = h2s[i].km;
        prevH2 = h2s[i].top;
    }
    let percent = 0;
    if (nextH2 !== prevH2) {
        percent = Math.max(0, Math.min(1, (scrollY + winH/2 - prevH2) / (nextH2 - prevH2)));
    }
    let kmValue = prevKm + (nextKm - prevKm) * percent;
    kmCounter.textContent = kmValue.toFixed(1);
}
window.addEventListener('scroll', updateKmOnScroll);
window.addEventListener('resize', updateKmOnScroll);
document.addEventListener('DOMContentLoaded', updateKmOnScroll);

// Lightweight GPX -> GeoJSON converter
// Provides window.togeojson.gpx(xmlDocument) -> GeoJSON FeatureCollection
(function (global) {
    'use strict';

    function text(node, tag) {
        var el = node.getElementsByTagName(tag)[0];
        return el ? el.textContent : null;
    }

    function parseNumber(v) {
        return v === null || v === undefined || v === '' ? null : Number(v);
    }

    function parseGPX(xml) {
        var features = [];

        // Tracks -> LineString features (one per trkseg)
        var trks = xml.getElementsByTagName('trk');
        for (var i = 0; i < trks.length; i++) {
            var trk = trks[i];
            var trkName = text(trk, 'name') || null;
            var segs = trk.getElementsByTagName('trkseg');
            for (var s = 0; s < segs.length; s++) {
                var seg = segs[s];
                var pts = seg.getElementsByTagName('trkpt');
                var coords = [];
                for (var p = 0; p < pts.length; p++) {
                    var pt = pts[p];
                    var lat = parseNumber(pt.getAttribute('lat'));
                    var lon = parseNumber(pt.getAttribute('lon'));
                    if (lat === null || lon === null) continue;
                    var ele = parseNumber(text(pt, 'ele'));
                    // follow GeoJSON lon,lat[,alt]
                    if (ele === null) coords.push([lon, lat]);
                    else coords.push([lon, lat, ele]);
                }
                if (coords.length) {
                    features.push({
                        type: 'Feature',
                        properties: { name: trkName },
                        geometry: { type: 'LineString', coordinates: coords }
                    });
                }
            }
        }

        // Waypoints -> Point features
        var wpts = xml.getElementsByTagName('wpt');
        for (var w = 0; w < wpts.length; w++) {
            var wpt = wpts[w];
            var lat = parseNumber(wpt.getAttribute('lat'));
            var lon = parseNumber(wpt.getAttribute('lon'));
            if (lat === null || lon === null) continue;
            var name = text(wpt, 'name') || text(wpt, 'desc') || null;
            var ele = parseNumber(text(wpt, 'ele'));
            var coords = ele === null ? [lon, lat] : [lon, lat, ele];
            features.push({
                type: 'Feature',
                properties: { name: name },
                geometry: { type: 'Point', coordinates: coords }
            });
        }

        // If there are no features but there are routes (rte/rtept), try those
        if (!features.length) {
            var rtes = xml.getElementsByTagName('rte');
            for (var r = 0; r < rtes.length; r++) {
                var rte = rtes[r];
                var pts = rte.getElementsByTagName('rtept');
                var coords = [];
                for (var p2 = 0; p2 < pts.length; p2++) {
                    var pt2 = pts[p2];
                    var lat2 = parseNumber(pt2.getAttribute('lat'));
                    var lon2 = parseNumber(pt2.getAttribute('lon'));
                    if (lat2 === null || lon2 === null) continue;
                    var ele2 = parseNumber(text(pt2, 'ele'));
                    if (ele2 === null) coords.push([lon2, lat2]);
                    else coords.push([lon2, lat2, ele2]);
                }
                if (coords.length) {
                    features.push({
                        type: 'Feature',
                        properties: {},
                        geometry: { type: 'LineString', coordinates: coords }
                    });
                }
            }
        }

        return { type: 'FeatureCollection', features: features };
    }

    // expose a minimal API compatible with togeojson.gpx(xml)
    global.togeojson = global.togeojson || {};
    global.togeojson.gpx = parseGPX;

})(typeof window !== 'undefined' ? window : this);

