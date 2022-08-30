import L from "leaflet";

/**
 * A marker canvas layer.
 *
 * Use {@link L.MarkerCanvas#addMarker} to add a marker.
 *
 * Use {@link L.MarkerCanvas#removeMarker} to remove a marker.
 *
 * Pass `false` to the second argument of these methods to optimize bulk operations. Call ${@link L.MarkerCanvas#redraw} to redraw the map afterwards.
 *
 * @class L.MarkerCanvas
 */
L.MarkersCanvas = L.Layer.extend(/** @lends L.MarkerCanvas.prototype */{
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	//
	// private: properties
	//
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * *

	_map: null,
	_canvas: null,
	_context: null,

	// leaflet markers (used to getBounds)
	_markers: {},

	// icon images index
	_icons: {},

	// * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	//
	// public: global
	//
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * *

	addTo(map) {
		map.addLayer(this);
		return this;
	},

	getBounds() {
		const bounds = new L.LatLngBounds();

		for (const id in this._markers)
			bounds.extend(this._markers[id].getLatLng());

		return bounds;
	},

	// * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	//
	// public: markers
	//
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * *

	/**
	 * Adds a marker to the map
	 * @param marker {import("leaflet").Marker} Marker to add
	 * @param redraw {boolean} If `true`, layer will automatically redraw. Pass `false` to optimize bulk calls but don't forget to call {@link L.MarkerCanvas#redraw} afterwards.
	 */
	addMarker(marker, redraw = true) {
		const notMarker = marker.options.pane !== "markerPane";
		const hasNoIcon = !marker.options.icon;
		if (notMarker || hasNoIcon) {
			console.error((notMarker ? "This is not a marker" : "This marker has no icon"), marker);
			return;
		}

		// required for pop-up and tooltip
		marker._map = this._map;

		this._markers[L.Util.stamp(marker)] = marker;

		if (redraw && this._isMarkerVisible(marker))
			this._drawMarker(marker);

	},

	/**
	 * Removes a marker from the map
	 * @param marker {import("leaflet").Marker} Marker to remove
	 * @param redraw {boolean} If `true`, layer will automatically redraw. Pass `false` to optimize bulk calls but don't forget to call {@link L.MarkerCanvas#redraw} afterwards.
	 */
	removeMarker(marker, redraw = true) {
		delete this._markers[L.Util.stamp(marker)];

		if (this._isMarkerVisible(marker) && redraw)
			this.redraw();
	},

	// * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	//
	// leaflet: default methods
	//
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * *

	initialize(options) {
		L.Util.setOptions(this, options);
	},

	// called by Leaflet on `map.addLayer`
	onAdd(map) {
		this._map = map;
		this._initCanvas();
		this.getPane().appendChild(this._canvas);

		map.on("moveend", this._reset, this);
		map.on("resize", this._reset, this);

		map.on("click", this._fire, this);
		map.on("mousemove", this._fire, this);

		if (map._zoomAnimated)
			map.on("zoomanim", this._animateZoom, this);
	},

	// called by Leaflet
	onRemove(map) {
		this.getPane().removeChild(this._canvas);

		map.off("click", this._fire, this);
		map.off("mousemove", this._fire, this);
		map.off("moveend", this._reset, this);
		map.off("resize", this._reset, this);

		if (map._zoomAnimated)
			map.off("zoomanim", this._animateZoom, this);
	},

	setOptions() {
		return this;
	},

	// * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	//
	// private: global methods
	//
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * *

	_initCanvas() {
		const {x, y} = this._map.getSize();
		const isAnimated = this._map.options.zoomAnimation && L.Browser.any3d;

		this._canvas = L.DomUtil.create(
			"canvas",
			"leaflet-markers-canvas-layer leaflet-layer"
		);
		this._canvas.width = x;
		this._canvas.height = y;
		this._context = this._canvas.getContext("2d");

		L.DomUtil.addClass(
			this._canvas,
			`leaflet-zoom-${isAnimated ? "animated" : "hide"}`
		);
	},

	// * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	//
	// private: marker methods
	//
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * *

	_drawMarker(marker) {
		const {iconUrl} = marker.options.icon.options;
		const latLng = marker.getLatLng();
		const {x, y} = this._map.latLngToContainerPoint(latLng);

		if (marker.image) {
			this._drawImage(marker, {x, y});
		} else if (this._icons[iconUrl]) {
			marker.image = this._icons[iconUrl].image;

			if (this._icons[iconUrl].isLoaded) {
				this._drawImage(marker, {x, y});
			} else {
				this._icons[iconUrl].elements.push({marker, x, y});
			}
		} else {
			const image = new Image();
			image.src = iconUrl;
			marker.image = image;

			this._icons[iconUrl] = {
				image,
				isLoaded: false,
				elements: [{marker, x, y}],
			};

			image.onload = () => {
				this._icons[iconUrl].isLoaded = true;
				const {elements} = this._icons[iconUrl]; // Buble doesn't like for...of, I'm too lazy to replace it with something else

				for (let i = 0; i < elements.length; i++) {
					const {marker, x, y} = elements[i];
					this._drawImage(marker, {x, y});
				}
			};
		}
	},

	_drawImage(marker, {x, y}) {
		const {rotationAngle, iconAnchor, iconSize} = marker.options.icon.options;
		const angle = rotationAngle || 0;

		this._context.save();
		this._context.translate(x, y);
		this._context.rotate((angle * Math.PI) / 180);
		this._context.drawImage(
			marker.image,
			-iconAnchor[0],
			-iconAnchor[1],
			iconSize[0],
			iconSize[1]
		);
		this._context.restore();
	},

	_getMarkerPxBounds(marker) {
		const latLng = marker.getLatLng();
		const {x, y} = this._map.latLngToContainerPoint(latLng);
		const {iconSize, iconAnchor} = marker.options.icon.options;
		return L.bounds(
			[x - iconAnchor[0], y - iconAnchor[1]],
			[x + iconSize[0] - iconAnchor[0], y + iconSize[1] - iconAnchor[1]]
		);
	},

	_getMarkerLatLngBounds(marker) {
		const {min, max} = this._getMarkerPxBounds(marker);
		return L.latLngBounds(
			this._map.containerPointToLatLng(min),
			this._map.containerPointToLatLng(max),
		);
	},

	_isMarkerVisible(marker) {
		if (!this._map)
			return false;

		return this._map.getBounds().overlaps(this._getMarkerLatLngBounds(marker));
	},

	redraw() {
		this._context.clearRect(0, 0, this._canvas.width, this._canvas.height);

		if (!this._map)
			return;

		for (const id in this._markers) {
			const marker = this._markers[id];

			if (this._isMarkerVisible(marker))
				this._drawMarker(marker);
		}
	},

	// * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	//
	// private: event methods
	//
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * *

	_reset() {
		const topLeft = this._map.containerPointToLayerPoint([0, 0]);
		L.DomUtil.setPosition(this._canvas, topLeft);

		const {x, y} = this._map.getSize();
		this._canvas.width = x;
		this._canvas.height = y;

		this.redraw();
	},

	_fire(event) {
		if (!this._markers)
			return;

		let foundMarker;

		for (const id in this._markers) {
			const marker = this._markers[id];
			const markerBounds = this._getMarkerPxBounds(marker);

			if (markerBounds.contains(event.containerPoint)) {
				foundMarker = marker;
				break;
			}
		}

		if (!foundMarker) {
			this._map._container.style.cursor = "";

			if (event.type === "mousemove" && this._mouseOverMarker) {

				if (this._mouseOverMarker.listens("mouseout"))
					this._mouseOverMarker.fire("mouseout");

				delete this._mouseOverMarker;
			}

			return;
		}

		this._map._container.style.cursor = "pointer";

		if (event.type === "click") {
			if (foundMarker.listens("click")) {
				foundMarker.fire("click");
			}
		}

		if (event.type === "mousemove") {
			if (this._mouseOverMarker && this._mouseOverMarker !== foundMarker) {
				if (this._mouseOverMarker.listens("mouseout")) {
					this._mouseOverMarker.fire("mouseout");
				}
			}

			if (!this._mouseOverMarker || this._mouseOverMarker !== foundMarker) {
				this._mouseOverMarker = foundMarker;
				if (foundMarker.listens("mouseover")) {
					foundMarker.fire("mouseover");
				}
			}
		}

	},

	_animateZoom(event) {
		const scale = this._map.getZoomScale(event.zoom);
		const offset = this._map._latLngBoundsToNewLayerBounds(
			this._map.getBounds(),
			event.zoom,
			event.center
		).min;

		L.DomUtil.setTransform(this._canvas, offset, scale);
	},
});
