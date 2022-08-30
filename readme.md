# leaflet-markers-canvas

A Leaflet plugin to render many markers in a canvas instead of the DOM.

This fork draws markers on the map's edges correctly.

The [original version](https://github.com/francoisromain/leaflet-markers-canvas) uses RBush to improve performance. However, as far as I can tell, it's impossible to use with the bounds. This fork uses a dead-simple linear search instead of a tree to check the bounds.

IDK what's performance difference in numbers, but this fork still does its job.

I don't know if I'll publish this on npm. For now, you can get it by adding this dependency to your `package.json`:

```
"leaflet-markers-canvas": "matafokka/leaflet-markers-canvas-correct-edges-behavior"
```
