(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(require('leaflet')) :
	typeof define === 'function' && define.amd ? define(['leaflet'], factory) :
	(global = global || self, factory(global.L));
}(this, (function (L) { 'use strict';

	L = L && Object.prototype.hasOwnProperty.call(L, 'default') ? L['default'] : L;

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

		addTo: function addTo(map) {
			map.addLayer(this);
			return this;
		},

		getBounds: function getBounds() {
			var bounds = new L.LatLngBounds();

			for (var id in this._markers)
				{ bounds.extend(this._markers[id].getLatLng()); }

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
		addMarker: function addMarker(marker, redraw) {
			if ( redraw === void 0 ) redraw = true;

			var notMarker = marker.options.pane !== "markerPane";
			var hasNoIcon = !marker.options.icon;
			if (notMarker || hasNoIcon) {
				console.error((notMarker ? "This is not a marker" : "This marker has no icon"), marker);
				return;
			}

			// required for pop-up and tooltip
			marker._map = this._map;

			this._markers[L.Util.stamp(marker)] = marker;

			if (redraw && this._isMarkerVisible(marker))
				{ this._drawMarker(marker); }

		},

		/**
		 * Removes a marker from the map
		 * @param marker {import("leaflet").Marker} Marker to remove
		 * @param redraw {boolean} If `true`, layer will automatically redraw. Pass `false` to optimize bulk calls but don't forget to call {@link L.MarkerCanvas#redraw} afterwards.
		 */
		removeMarker: function removeMarker(marker, redraw) {
			if ( redraw === void 0 ) redraw = true;

			delete this._markers[L.Util.stamp(marker)];

			if (this._isMarkerVisible(marker) && redraw)
				{ this.redraw(); }
		},

		// * * * * * * * * * * * * * * * * * * * * * * * * * * * *
		//
		// leaflet: default methods
		//
		// * * * * * * * * * * * * * * * * * * * * * * * * * * * *

		initialize: function initialize(options) {
			L.Util.setOptions(this, options);
		},

		// called by Leaflet on `map.addLayer`
		onAdd: function onAdd(map) {
			this._map = map;
			this._initCanvas();
			this.getPane().appendChild(this._canvas);

			map.on("moveend", this._reset, this);
			map.on("resize", this._reset, this);

			map.on("click", this._fire, this);
			map.on("mousemove", this._fire, this);

			if (map._zoomAnimated)
				{ map.on("zoomanim", this._animateZoom, this); }
		},

		// called by Leaflet
		onRemove: function onRemove(map) {
			this.getPane().removeChild(this._canvas);

			map.off("click", this._fire, this);
			map.off("mousemove", this._fire, this);
			map.off("moveend", this._reset, this);
			map.off("resize", this._reset, this);

			if (map._zoomAnimated)
				{ map.off("zoomanim", this._animateZoom, this); }
		},

		setOptions: function setOptions() {
			return this;
		},

		// * * * * * * * * * * * * * * * * * * * * * * * * * * * *
		//
		// private: global methods
		//
		// * * * * * * * * * * * * * * * * * * * * * * * * * * * *

		_initCanvas: function _initCanvas() {
			var ref = this._map.getSize();
			var x = ref.x;
			var y = ref.y;
			var isAnimated = this._map.options.zoomAnimation && L.Browser.any3d;

			this._canvas = L.DomUtil.create(
				"canvas",
				"leaflet-markers-canvas-layer leaflet-layer"
			);
			this._canvas.width = x;
			this._canvas.height = y;
			this._context = this._canvas.getContext("2d");

			L.DomUtil.addClass(
				this._canvas,
				("leaflet-zoom-" + (isAnimated ? "animated" : "hide"))
			);
		},

		// * * * * * * * * * * * * * * * * * * * * * * * * * * * *
		//
		// private: marker methods
		//
		// * * * * * * * * * * * * * * * * * * * * * * * * * * * *

		_drawMarker: function _drawMarker(marker) {
			var this$1 = this;

			var ref = marker.options.icon.options;
			var iconUrl = ref.iconUrl;
			var latLng = marker.getLatLng();
			var ref$1 = this._map.latLngToContainerPoint(latLng);
			var x = ref$1.x;
			var y = ref$1.y;

			if (marker.image) {
				this._drawImage(marker, {x: x, y: y});
			} else if (this._icons[iconUrl]) {
				marker.image = this._icons[iconUrl].image;

				if (this._icons[iconUrl].isLoaded) {
					this._drawImage(marker, {x: x, y: y});
				} else {
					this._icons[iconUrl].elements.push({marker: marker, x: x, y: y});
				}
			} else {
				var image = new Image();
				image.src = iconUrl;
				marker.image = image;

				this._icons[iconUrl] = {
					image: image,
					isLoaded: false,
					elements: [{marker: marker, x: x, y: y}],
				};

				image.onload = function () {
					this$1._icons[iconUrl].isLoaded = true;
					var ref = this$1._icons[iconUrl];
					var elements = ref.elements; // Buble doesn't like for...of, I'm too lazy to replace it with something else

					for (var i = 0; i < elements.length; i++) {
						var ref$1 = elements[i];
						var marker = ref$1.marker;
						var x = ref$1.x;
						var y = ref$1.y;
						this$1._drawImage(marker, {x: x, y: y});
					}
				};
			}
		},

		_drawImage: function _drawImage(marker, ref) {
			var x = ref.x;
			var y = ref.y;

			var ref$1 = marker.options.icon.options;
			var rotationAngle = ref$1.rotationAngle;
			var iconAnchor = ref$1.iconAnchor;
			var iconSize = ref$1.iconSize;
			var angle = rotationAngle || 0;

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

		_getMarkerPxBounds: function _getMarkerPxBounds(marker) {
			var latLng = marker.getLatLng();
			var ref = this._map.latLngToContainerPoint(latLng);
			var x = ref.x;
			var y = ref.y;
			var ref$1 = marker.options.icon.options;
			var iconSize = ref$1.iconSize;
			var iconAnchor = ref$1.iconAnchor;
			return L.bounds(
				[x - iconAnchor[0], y - iconAnchor[1]],
				[x + iconSize[0] - iconAnchor[0], y + iconSize[1] - iconAnchor[1]]
			);
		},

		_getMarkerLatLngBounds: function _getMarkerLatLngBounds(marker) {
			var ref = this._getMarkerPxBounds(marker);
			var min = ref.min;
			var max = ref.max;
			return L.latLngBounds(
				this._map.containerPointToLatLng(min),
				this._map.containerPointToLatLng(max)
			);
		},

		_isMarkerVisible: function _isMarkerVisible(marker) {
			if (!this._map)
				{ return false; }

			return this._map.getBounds().overlaps(this._getMarkerLatLngBounds(marker));
		},

		redraw: function redraw() {
			this._context.clearRect(0, 0, this._canvas.width, this._canvas.height);

			if (!this._map)
				{ return; }

			for (var id in this._markers) {
				var marker = this._markers[id];

				if (this._isMarkerVisible(marker))
					{ this._drawMarker(marker); }
			}
		},

		// * * * * * * * * * * * * * * * * * * * * * * * * * * * *
		//
		// private: event methods
		//
		// * * * * * * * * * * * * * * * * * * * * * * * * * * * *

		_reset: function _reset() {
			var topLeft = this._map.containerPointToLayerPoint([0, 0]);
			L.DomUtil.setPosition(this._canvas, topLeft);

			var ref = this._map.getSize();
			var x = ref.x;
			var y = ref.y;
			this._canvas.width = x;
			this._canvas.height = y;

			this.redraw();
		},

		_fire: function _fire(event) {
			if (!this._markers)
				{ return; }

			var foundMarker;

			for (var id in this._markers) {
				var marker = this._markers[id];
				var markerBounds = this._getMarkerPxBounds(marker);

				if (markerBounds.contains(event.containerPoint)) {
					foundMarker = marker;
					break;
				}
			}

			if (!foundMarker) {
				this._map._container.style.cursor = "";

				if (event.type === "mousemove" && this._mouseOverMarker) {

					if (this._mouseOverMarker.listens("mouseout"))
						{ this._mouseOverMarker.fire("mouseout"); }

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

		_animateZoom: function _animateZoom(event) {
			var scale = this._map.getZoomScale(event.zoom);
			var offset = this._map._latLngBoundsToNewLayerBounds(
				this._map.getBounds(),
				event.zoom,
				event.center
			).min;

			L.DomUtil.setTransform(this._canvas, offset, scale);
		},
	});

})));
