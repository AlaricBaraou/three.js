import {
	Group,
	LineSegments,
	BufferGeometry,
	LineBasicMaterial,
	Box3Helper,
	Box3,
	PlaneGeometry,
	MeshBasicMaterial,
	BufferAttribute,
	DoubleSide,
	Vector3,
	Mesh,
	Color
} from 'three';

class TileSystemHelper extends Group {

	constructor( tileSystem ) {

		super();

		this.tileSystem = tileSystem;
		this.displayGrid = true;
		this.displayActiveTiles = true;
		this.displayUpdateRadius = true;

		this.gridMaterial = new LineBasicMaterial( { color: 0x444444 } );
		this.activeTileMaterial = new LineBasicMaterial( { color: 0x00ff00 } );
		this.radiusMaterial = new LineBasicMaterial( {
			color: 0x0088ff,
			transparent: true,
			opacity: 0.5
		} );

		this.gridLines = new Group();
		this.activeTileHelpers = new Group();
		this.radiusHelper = null;

		this.initializeHelpers();
		this.add( this.gridLines );
		this.add( this.activeTileHelpers );

	}

	initializeHelpers() {

		// Create base grid
		this.updateGridLines();

		// Create radius indicator
		this.createRadiusHelper();

	}

	updateGridLines() {

		this.gridLines.clear();

		const radius = this.tileSystem.updateRadius;
		const tileSize = this.tileSystem.tileSize;
		const gridSize = Math.ceil( radius / tileSize ) * 2;

		// Create grid lines
		const size = gridSize * tileSize;
		const divisions = gridSize;
		const center = new Vector3();

		const halfSize = size / 2;
		const step = size / divisions;

		const vertices = [];

		// Create vertical lines
		for ( let i = 0; i <= divisions; i ++ ) {

			const x = ( i * step ) - halfSize;
			vertices.push( x, - halfSize, 0 );
			vertices.push( x, halfSize, 0 );

		}

		// Create horizontal lines
		for ( let i = 0; i <= divisions; i ++ ) {

			const y = ( i * step ) - halfSize;
			vertices.push( - halfSize, y, 0 );
			vertices.push( halfSize, y, 0 );

		}

		const geometry = new BufferGeometry();
		geometry.setAttribute( 'position', new BufferAttribute( new Float32Array( vertices ), 3 ) );

		const grid = new LineSegments( geometry, this.gridMaterial );
		grid.rotation.x = Math.PI / 2;

		this.gridLines.add( grid );

	}

	createRadiusHelper() {

		const radius = this.tileSystem.updateRadius;

		// Create circle geometry for radius
		const segments = 64;
		const vertices = [];

		for ( let i = 0; i <= segments; i ++ ) {

			const theta = ( i / segments ) * Math.PI * 2;
			vertices.push(
				Math.cos( theta ) * radius,
				0,
				Math.sin( theta ) * radius
			);

		}

		const geometry = new BufferGeometry();
		geometry.setAttribute( 'position', new BufferAttribute( new Float32Array( vertices ), 3 ) );

		this.radiusHelper = new LineSegments( geometry, this.radiusMaterial );
		this.add( this.radiusHelper );

	}

	updateActiveTileHelpers() {

		this.activeTileHelpers.clear();

		// Create helpers for each active tile
		for ( const [ key, tileData ] of this.tileSystem.activeTiles ) {

			const box = new Box3Helper( tileData.bounds, new Color( 0x00ff00 ) );
			this.activeTileHelpers.add( box );

			// Add tile coordinate label (optional)
			// You could add Text3D or Sprite here to show tile coordinates

		}

	}

	update( ) {

		// Get camera position from tileSystem
		const cameraPosition = this.tileSystem.lastUpdatePosition;

		// Update grid position to follow camera in tile-sized increments
		this.position.x = Math.floor( cameraPosition.x / this.tileSystem.tileSize ) * this.tileSystem.tileSize;
		this.position.z = Math.floor( cameraPosition.z / this.tileSystem.tileSize ) * this.tileSystem.tileSize;

		// Update visibility
		this.gridLines.visible = this.displayGrid;
		this.activeTileHelpers.visible = this.displayActiveTiles;
		if ( this.radiusHelper ) {

			this.radiusHelper.visible = this.displayUpdateRadius;
			this.radiusHelper.position.copy( cameraPosition );
			this.radiusHelper.position.y = 0;

		}

		// Update active tile visualizations
		this.updateActiveTileHelpers();

		// Ensure matrix is updated
		this.updateMatrixWorld( true );

	}

	dispose() {

		// Dispose of geometries and materials
		this.gridLines.traverse( ( child ) => {

			if ( child.geometry ) child.geometry.dispose();
			if ( child.material ) child.material.dispose();

		} );

		this.activeTileHelpers.traverse( ( child ) => {

			if ( child.geometry ) child.geometry.dispose();
			if ( child.material ) child.material.dispose();

		} );

		if ( this.radiusHelper ) {

			this.radiusHelper.geometry.dispose();
			this.radiusMaterial.dispose();

		}

	}

}

export { TileSystemHelper };
