;(function() {
'use strict';

function DroneBuildingWorkflow(options) {
	this.initialize(options);
}

DroneBuildingWorkflow.prototype.initialize = function(options) {
	var mapOptions = {
		center: new google.maps.LatLng(options.center.lat, options.center.lng),
		zoom: options.zoom,
		streetViewControl: false 
	};
	
	// the Google map
	this.map = new google.maps.Map(document.getElementById(options.ids['map']), mapOptions);

	// ids of relevant DOM elements
	this.ids = options.ids;

	// initialize components
	this.initializeFlight();
	this.initializeGeocoder();
	this.initializeDrawingManager();
}

DroneBuildingWorkflow.prototype.initializeFlight = function() {
	this.flight = new google.maps.MVCObject();
	this.flight.setValues({
		perimeter: 0,
		area: 0,
		height: 0
	});
	
	var renderInfo = this.renderInfo.bind(this);
	google.maps.event.addListener(this.flight, 'perimeter_changed', renderInfo);
	google.maps.event.addListener(this.flight, 'area_changed', renderInfo);
	google.maps.event.addListener(this.flight, 'height_changed', renderInfo);
}

DroneBuildingWorkflow.prototype.renderInfo = function() {
	var perimeter = this.flight.get('perimeter').toFixed(0);
	var area = this.flight.get('area').toFixed(0);
	var height = this.flight.get('height').toFixed(0);
	console.log(perimeter + 'm', area + 'm^2');
}

DroneBuildingWorkflow.prototype.initializeGeocoder = function() {
	// geocoder search
	var geocoder = new google.maps.Geocoder();
	var input = document.getElementById(this.ids['search-input']);
	var form = document.getElementById(this.ids['search-form']);
	var map = this.map;
	
	function searchLocation() {
		geocoder.geocode( { 'address': input.value}, function(results, status) {
			if (status == google.maps.GeocoderStatus.OK) {
				var latLng = results[0].geometry.location;
				map.setCenter(latLng);
			} else {
				alert('Geocoding failed: ' + status);
			}
		});
	}
	google.maps.event.addDomListener(form, 'submit', function(e) {
		e.preventDefault();
		searchLocation();
	});
}

DroneBuildingWorkflow.prototype.initializeDrawingManager = function() {
	// UI control for choosing a shape to draw
	this.drawingManager = new google.maps.drawing.DrawingManager({
		drawingMode: null,
		drawingControl: true,
		drawingControlOptions: {
			position: google.maps.ControlPosition.TOP_CENTER,
			drawingModes: [
				google.maps.drawing.OverlayType.CIRCLE,
				google.maps.drawing.OverlayType.POLYGON,
				google.maps.drawing.OverlayType.RECTANGLE
			]
		},
		map: this.map,
		circleOptions: {
			draggable: true,
			editable: true
		},
		polygonOptions: {
			draggable: true,
			editable: true
		},
		rectangleOptions: {
			draggable: true,
			editable: true
		}
	});

	var self = this;

	// when a shape is drawn
	google.maps.event.addListener(this.drawingManager, 'overlaycomplete', function(e) {
		this.setDrawingMode(null);
		var shape = {
			overlay: e.overlay,
			type: e.type
		};
		self.initializeShape(shape);
	});
}
	
DroneBuildingWorkflow.prototype.initializeShape = function(shape) {
	// destroy old shape
	if (this.shape) {
		this.removeShape(this.shape);
	}
	
	// save new shape
	this.shape = shape;
	
	// add events when shape changes
	var calculateInfo = this.calculateInfo.bind(this);
	if (shape.type == google.maps.drawing.OverlayType.CIRCLE) {
		google.maps.event.addListener(shape.overlay, 'center_changed', calculateInfo);
		google.maps.event.addListener(shape.overlay, 'radius_changed', calculateInfo);
	}
	else if (shape.type == google.maps.drawing.OverlayType.RECTANGLE) {
		google.maps.event.addListener(shape.overlay, 'bounds_changed', calculateInfo);
	}
	else if (shape.type == google.maps.drawing.OverlayType.POLYGON) {
		google.maps.event.addListener(shape.overlay, 'dragend', calculateInfo);
		google.maps.event.addListener(shape.overlay.getPath(), 'insert_at', calculateInfo);
		google.maps.event.addListener(shape.overlay.getPath(), 'remove_at', calculateInfo);
		google.maps.event.addListener(shape.overlay.getPath(), 'set_at', calculateInfo);		
	}
	
	// calculateInfo the first time
	this.calculateInfo();
}

DroneBuildingWorkflow.prototype.removeShape = function(shape) {
	if (shape.overlay) {
		google.maps.event.clearInstanceListeners(shape.overlay);
		shape.overlay.setMap(null);
		shape.overlay = null;
	}
	shape.type = '';
}

DroneBuildingWorkflow.prototype.calculateInfo = function() {
	var perimeter = DroneBuildingWorkflow.getPerimeter(this.shape);
	if (perimeter != this.flight.get('perimeter')) {
		this.flight.set('perimeter', perimeter);
	}
	
	var area = DroneBuildingWorkflow.getArea(this.shape);
	if (area != this.flight.get('area')) {
		this.flight.set('area', area);
	}
}

// utility functions
DroneBuildingWorkflow.getPerimeter = function(shape) {
	var perimeter = 0;
	if (shape.type == google.maps.drawing.OverlayType.CIRCLE) {
		perimeter = 2 * Math.PI * shape.overlay.getRadius();
	}
	else if (shape.type == google.maps.drawing.OverlayType.RECTANGLE) {
		var bounds = shape.overlay.getBounds();
		var path = DroneBuildingWorkflow.boundsToPath(bounds);
		perimeter = google.maps.geometry.spherical.computeLength(path);
	}
	else if (shape.type == google.maps.drawing.OverlayType.POLYGON) {
		var path = shape.overlay.getPath();
		perimeter = google.maps.geometry.spherical.computeLength(path);
	}
	return perimeter;
}
DroneBuildingWorkflow.getArea = function(shape) {
	var area = 0;
	if (shape.type == google.maps.drawing.OverlayType.CIRCLE) {
		var radius = shape.overlay.getRadius();
		area = Math.PI * radius * radius;
	}
	else if (shape.type == google.maps.drawing.OverlayType.RECTANGLE) {
		var bounds = shape.overlay.getBounds();
		var path = DroneBuildingWorkflow.boundsToPath(bounds);
		area = google.maps.geometry.spherical.computeArea(path);
	}
	else if (shape.type == google.maps.drawing.OverlayType.POLYGON) {
		var path = shape.overlay.getPath();
		area = google.maps.geometry.spherical.computeArea(path);
	}
	return area;
}

// the Rectangle class doesn't have a getPath method
DroneBuildingWorkflow.boundsToPath = function(bounds) {
	var sw = bounds.getSouthWest();
	var ne = bounds.getNorthEast();
	var nw = new google.maps.LatLng(ne.lat(), sw.lng());
	var se = new google.maps.LatLng(sw.lat(), ne.lng());
	var path = new google.maps.MVCArray([sw, nw, ne, se]);
	return path;
}

// usage
function initialize() {
	var options = {
		center: {lat: 37.792, lng: -122.403},
		zoom: 17,
		ids: {
			'map': 'map-canvas',
			'search-form': 'search-form',
			'search-input': 'search-input'
		}
	};
	new DroneBuildingWorkflow(options);
}
google.maps.event.addDomListener(window, 'load', initialize);

})();