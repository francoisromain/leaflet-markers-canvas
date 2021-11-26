import L from "leaflet";
import RBush from "rbush";

const markersCanvas = {
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  //
  // private: properties
  //
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * *

  _map: null,
  _canvas: null,
  _context: null,

  // leaflet markers (used to getBounds)
  _markers: [],

  // visible markers
  _markersTree: new RBush(),

  // every marker positions (even out of the canvas)
  _positionsTree: new RBush(),

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

    this._markers.forEach((marker) => {
      bounds.extend(marker.getLatLng());
    });

    return bounds;
  },

  redraw() {
    this._redraw(true);
  },

  clear() {
    this._positionsTree = new RBush();
    this._markersTree = new RBush();
    this._markers = [];
    this._redraw(true);
  },

  // * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  //
  // public: markers
  //
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * *

  addMarker(marker) {
    const { markerBox, positionBox, isVisible } = this._addMarker(marker);

    if (markerBox && isVisible) {
      this._markersTree.insert(markerBox);
    }

    if (positionBox) {
      this._positionsTree.insert(positionBox);
    }
  },

  // add multiple markers (better for rBush performance)
  addMarkers(markers) {
    const markerBoxes = [];
    const positionBoxes = [];

    markers.forEach((marker) => {
      const { markerBox, positionBox, isVisible } = this._addMarker(marker);

      if (markerBox && isVisible) {
        markerBoxes.push(markerBox);
      }

      if (positionBox) {
        positionBoxes.push(positionBox);
      }
    });

    this._markersTree.load(markerBoxes);
    this._positionsTree.load(positionBoxes);
  },

  removeMarker(marker) {
    const latLng = marker.getLatLng();
    const isVisible = this._map.getBounds().contains(latLng);

    const positionBox = {
      minX: latLng.lng,
      minY: latLng.lat,
      maxX: latLng.lng,
      maxY: latLng.lat,
      marker,
    };

    this._positionsTree.remove(positionBox, (a, b) => {
      return a.marker._leaflet_id === b.marker._leaflet_id;
    });

    if (isVisible) {
      this._redraw(true);
    }
  },

  // remove multiple markers (better for rBush performance)
  removeMarkers(markers) {
    let hasChanged = false;

    markers.forEach((marker) => {
      const latLng = marker.getLatLng();
      const isVisible = this._map.getBounds().contains(latLng);

      const positionBox = {
        minX: latLng.lng,
        minY: latLng.lat,
        maxX: latLng.lng,
        maxY: latLng.lat,
        marker,
      };

      this._positionsTree.remove(positionBox, (a, b) => {
        return a.marker._leaflet_id === b.marker._leaflet_id;
      });

      if (isVisible) {
        hasChanged = true;
      }
    });

    if (hasChanged) {
      this._redraw(true);
    }
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

    if (map._zoomAnimated) {
      map.on("zoomanim", this._animateZoom, this);
    }
  },

  // called by Leaflet
  onRemove(map) {
    this.getPane().removeChild(this._canvas);

    map.off("click", this._fire, this);
    map.off("mousemove", this._fire, this);
    map.off("moveend", this._reset, this);
    map.off("resize", this._reset, this);

    if (map._zoomAnimated) {
      map.off("zoomanim", this._animateZoom, this);
    }
  },

  setOptions(options) {
    L.Util.setOptions(this, options);

    return this.redraw();
  },

  // * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  //
  // private: global methods
  //
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * *

  _initCanvas() {
    const { x, y } = this._map.getSize();
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

  _addMarker(marker) {
    if (marker.options.pane !== "markerPane" || !marker.options.icon) {
      console.error("This is not a marker", marker);

      return { markerBox: null, positionBox: null, isVisible: null };
    }

    // required for pop-up and tooltip
    marker._map = this._map;

    // add _leaflet_id property
    L.Util.stamp(marker);

    const latLng = marker.getLatLng();
    const isVisible = this._map.getBounds().contains(latLng);
    const { x, y } = this._map.latLngToContainerPoint(latLng);
    const { iconSize, iconAnchor } = marker.options.icon.options;

    const markerBox = {
      minX: x - iconAnchor[0],
      minY: y - iconAnchor[1],
      maxX: x + iconSize[0] - iconAnchor[0],
      maxY: y + iconSize[1] - iconAnchor[1],
      marker,
    };

    const positionBox = {
      minX: latLng.lng,
      minY: latLng.lat,
      maxX: latLng.lng,
      maxY: latLng.lat,
      marker,
    };

    if (isVisible) {
      this._drawMarker(marker, { x, y });
    }

    this._markers.push(marker);

    return { markerBox, positionBox, isVisible };
  },

  _drawMarker(marker, { x, y }) {
    const { iconUrl } = marker.options.icon.options;

    if (marker.image) {
      this._drawImage(marker, { x, y });
    } else if (this._icons[iconUrl]) {
      marker.image = this._icons[iconUrl].image;

      if (this._icons[iconUrl].isLoaded) {
        this._drawImage(marker, { x, y });
      } else {
        this._icons[iconUrl].elements.push({ marker, x, y });
      }
    } else {
      const image = new Image();
      image.src = iconUrl;
      marker.image = image;

      this._icons[iconUrl] = {
        image,
        isLoaded: false,
        elements: [{ marker, x, y }],
      };

      image.onload = () => {
        this._icons[iconUrl].isLoaded = true;
        this._icons[iconUrl].elements.forEach(({ marker, x, y }) => {
          this._drawImage(marker, { x, y });
        });
      };
    }
  },

  _drawImage(marker, { x, y }) {
    const { rotationAngle, iconAnchor, iconSize } = marker.options.icon.options;
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

  _redraw(clear) {
    if (clear) {
      this._context.clearRect(0, 0, this._canvas.width, this._canvas.height);
    }

    if (!this._map || !this._positionsTree) return;

    const mapBounds = this._map.getBounds();
    const mapBoundsBox = {
      minX: mapBounds.getWest(),
      minY: mapBounds.getSouth(),
      maxX: mapBounds.getEast(),
      maxY: mapBounds.getNorth(),
    };

    // draw only visible markers
    const markers = [];
    this._positionsTree.search(mapBoundsBox).forEach(({ marker }) => {
      const latLng = marker.getLatLng();
      const { x, y } = this._map.latLngToContainerPoint(latLng);
      const { iconSize, iconAnchor } = marker.options.icon.options;

      const markerBox = {
        minX: x - iconAnchor[0],
        minY: y - iconAnchor[1],
        maxX: x + iconSize[0] - iconAnchor[0],
        maxY: y + iconSize[1] - iconAnchor[1],
        marker,
      };

      markers.push(markerBox);
      this._drawMarker(marker, { x, y });
    });

    this._markersTree.clear();
    this._markersTree.load(markers);
  },

  // * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  //
  // private: event methods
  //
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * *

  _reset() {
    const topLeft = this._map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this._canvas, topLeft);

    const { x, y } = this._map.getSize();
    this._canvas.width = x;
    this._canvas.height = y;

    this._redraw();
  },

  _fire(event) {
    if (!this._markersTree) return;

    const { x, y } = event.containerPoint;
    const markers = this._markersTree.search({
      minX: x,
      minY: y,
      maxX: x,
      maxY: y,
    });

    if (markers && markers.length) {
      this._map._container.style.cursor = "pointer";
      const marker = markers[0].marker;

      if (event.type === "click") {
        if (marker.listens("click")) {
          marker.fire("click");
        }
      }

      if (event.type === "mousemove") {
        if (this._mouseOverMarker && this._mouseOverMarker !== marker) {
          if (this._mouseOverMarker.listens("mouseout")) {
            this._mouseOverMarker.fire("mouseout");
          }
        }

        if (!this._mouseOverMarker || this._mouseOverMarker !== marker) {
          this._mouseOverMarker = marker;
          if (marker.listens("mouseover")) {
            marker.fire("mouseover");
          }
        }
      }
    } else {
      this._map._container.style.cursor = "";
      if (event.type === "mousemove" && this._mouseOverMarker) {
        if (this._mouseOverMarker.listens("mouseout")) {
          this._mouseOverMarker.fire("mouseout");
        }

        delete this._mouseOverMarker;
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
};

L.MarkersCanvas = L.Layer.extend(markersCanvas);
