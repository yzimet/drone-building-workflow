/*
Author: Yaniv Zimet
*/

;(function() {
'use strict';

// constants
// (I'm guessing at these)
var DRONE_SPEED = 6.7056; // 15mph expressed in meters/second
var DRONE_IMAGERY_HEIGHT = 5; // meters

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
	this.map = new google.maps.Map(document.getElementById(options.ids.map), mapOptions);

	// ids of relevant DOM elements
	this.ids = options.ids;
	
	// shape and marker
	this.shape = null;
	this.marker = null;

	// initialize components
	this.initializeFlight();
	this.initializeGeocoder();
	this.initializeDrawingManager();
	
	// render
	this.renderConstantInfo();
}

DroneBuildingWorkflow.prototype.initializeFlight = function() {
	var flight = this.flight = new google.maps.MVCObject();
	this.flight.setValues({
		perimeter: 0,
		area: 0,
		height: 0,
		radius: 0
	});
	
	// height listener
	var heightInput = document.getElementById(this.ids.height);
	google.maps.event.addDomListener(heightInput, 'change', function(e) {
		var height = parseFloat(this.value);
		flight.set('height', height);
	});
	var height = parseFloat(heightInput.value);
	this.flight.set('height', height);
	
	// radius listener
	var radiusInput = document.getElementById(this.ids.radius);
	google.maps.event.addDomListener(radiusInput, 'change', function(e) {
		var radius = parseFloat(this.value);
		flight.set('radius', radius);
	});
	
	var renderInfo = this.renderInfo.bind(this);
	google.maps.event.addListener(this.flight, 'perimeter_changed', renderInfo);
	google.maps.event.addListener(this.flight, 'area_changed', renderInfo);
	google.maps.event.addListener(this.flight, 'height_changed', renderInfo);
	google.maps.event.addListener(this.flight, 'radius_changed', renderInfo);
}

DroneBuildingWorkflow.prototype.renderInfo = function() {
	var perimeter = this.flight.get('perimeter');
	var area = this.flight.get('area');
	var height = this.flight.get('height');
	var radius = this.flight.get('radius');
	
	document.getElementById(this.ids.perimeter).value = perimeter.toFixed(0);
	document.getElementById(this.ids.area).value = area.toFixed(0);
	document.getElementById(this.ids.radius).value = radius.toFixed(0);
	
	// one lap is a single perimeter plus the vertical distance needed to climb to that lap height
	var numLaps = Math.ceil(height / DRONE_IMAGERY_HEIGHT);
	var timePerLap = (perimeter + DRONE_IMAGERY_HEIGHT) / DRONE_SPEED;	
	var timeTotal = timePerLap * numLaps;

	document.getElementById(this.ids.numLaps).value = numLaps.toFixed(0);
	document.getElementById(this.ids.timePerLap).value = timePerLap.toFixed(0);
	document.getElementById(this.ids.timeTotal).value = timeTotal.toFixed(0);
}

DroneBuildingWorkflow.prototype.renderConstantInfo = function() {
	document.getElementById(this.ids.droneSpeed).value = DRONE_SPEED.toFixed(1);
	document.getElementById(this.ids.droneImageryHeight).value = DRONE_IMAGERY_HEIGHT.toFixed(0);
}

DroneBuildingWorkflow.prototype.renderPositionInfo = function() {
	var str = this.marker.getPosition().toUrlValue(4);
	document.getElementById(this.ids.landingLocation).value = str;
}

DroneBuildingWorkflow.prototype.initializeGeocoder = function() {
	// geocoder search
	var geocoder = new google.maps.Geocoder();
	var input = document.getElementById(this.ids.searchInput);
	var form = document.getElementById(this.ids.searchForm);
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
				google.maps.drawing.OverlayType.RECTANGLE,
				google.maps.drawing.OverlayType.POLYGON,
				google.maps.drawing.OverlayType.MARKER
			]
		},
		map: this.map,
		circleOptions: {
			draggable: true,
			editable: true,
			strokeColor: 'green'
		},
		markerOptions: {
			draggable: true,
			title: 'Landing location'
		},
		polygonOptions: {
			draggable: true,
			editable: true,
			strokeColor: 'green'
		},
		rectangleOptions: {
			draggable: true,
			editable: true,
			strokeColor: 'green'
		}
	});

	var self = this;

	// when a shape is drawn
	google.maps.event.addListener(this.drawingManager, 'overlaycomplete', function(e) {
		this.setDrawingMode(null);
		if (e.type == google.maps.drawing.OverlayType.MARKER) {
			self.initializeMarker(e.overlay);
		}
		else {
			var shape = {
				overlay: e.overlay,
				type: e.type
			};
			self.initializeShape(shape);
		}
	});
}

DroneBuildingWorkflow.prototype.initializeMarker = function(marker) {
	// destroy old marker and save new marker
	this.removeOverlay(this.marker);
	this.marker = marker;
	
	var renderPositionInfo = this.renderPositionInfo.bind(this);
	google.maps.event.addListener(marker, 'position_changed', renderPositionInfo);
	
	// renderPositionInfo the first time
	this.renderPositionInfo();
}
	
DroneBuildingWorkflow.prototype.initializeShape = function(shape) {
	// destroy old shape and save new shape
	this.removeShape(this.shape);
	this.shape = shape;
	
	// add events when shape changes
	var calculateInfo = this.calculateInfo.bind(this);
	if (shape.type == google.maps.drawing.OverlayType.CIRCLE) {
		google.maps.event.addListener(shape.overlay, 'center_changed', calculateInfo);
		google.maps.event.addListener(shape.overlay, 'radius_changed', calculateInfo);
		this.flight.unbind('radius');
		this.flight.bindTo('radius', shape.overlay, 'radius');
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
	
	// used to show/hide radius input for circle only
	document.getElementById(this.ids.dataTable).setAttribute('data-shape', shape.type);
}

DroneBuildingWorkflow.prototype.removeShape = function(shape) {
	if (!shape) {
		return;
	}
	this.removeOverlay(shape.overlay);
	shape.type = '';
}

DroneBuildingWorkflow.prototype.removeOverlay = function(overlay) {
	if (!overlay) {
		return;
	}
	google.maps.event.clearInstanceListeners(overlay);
	overlay.setMap(null);
	overlay = null;
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
			map: 'map-canvas',
			searchForm: 'search-form',
			searchInput: 'search-input',
			height: 'height',
			radius: 'radius',
			perimeter: 'perimeter',
			area: 'area',
			numLaps: 'num-laps',
			droneSpeed: 'drone-speed',
			droneImageryHeight: 'drone-imagery-height',
			timePerLap: 'time-per-lap',
			timeTotal: 'time-total',
			landingLocation: 'landing-location',
			dataTable: 'data-table'
		}
	};
	new DroneBuildingWorkflow(options);
}
google.maps.event.addDomListener(window, 'load', initialize);

})();