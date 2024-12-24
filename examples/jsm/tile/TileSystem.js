import * as THREE from 'three';

export class TileSystem {

	constructor( width, height, tileSize = 1 ) {

		this.width = width;
		this.height = height;
		this.tileSize = tileSize;

		// Initialize tiles with height and obstruction information
		this.tiles = new Array( width * height ).fill( null ).map( () => ( {
			height: 0, // Current height of obstacles in this tile
			maxHeight: Infinity, // Maximum allowed height (for flying restrictions)
			isObstructed: false, // Whether tile blocks light
			shadowHeight: 0 // Height of the shadow cast on this tile
		} ) );

		this.worldWidth = width * tileSize;
		this.worldHeight = height * tileSize;

		// Create helper geometry
		this.helper = this.createHelper();

	}

	createHelper() {

		const helper = new THREE.Group();

		// Base grid lines
		const material = new THREE.LineBasicMaterial( {
			color: 0x888888,
			transparent: true,
			opacity: 0.5
		} );

		// Vertical lines
		for ( let x = 0; x <= this.width; x ++ ) {

			const worldX = x * this.tileSize - ( this.worldWidth / 2 );
			const geometry = new THREE.BufferGeometry().setFromPoints( [
				new THREE.Vector3( worldX, 0, - this.worldHeight / 2 ),
				new THREE.Vector3( worldX, 0, this.worldHeight / 2 )
			] );
			helper.add( new THREE.Line( geometry, material ) );

		}

		// Horizontal lines
		for ( let z = 0; z <= this.height; z ++ ) {

			const worldZ = z * this.tileSize - ( this.worldHeight / 2 );
			const geometry = new THREE.BufferGeometry().setFromPoints( [
				new THREE.Vector3( - this.worldWidth / 2, 0, worldZ ),
				new THREE.Vector3( this.worldWidth / 2, 0, worldZ )
			] );
			helper.add( new THREE.Line( geometry, material ) );

		}

		// Store height indicators for updating
		this.heightIndicators = new Map();

		return helper;

	}

	// Update or create height indicator for a tile
	updateHeightIndicator( x, z ) {

		const tileData = this.getTileData( x, z );
		if ( ! tileData || tileData.height === 0 ) return;

		const key = `${x},${z}`;
		let line = this.heightIndicators.get( key );

		// Create new height indicator if needed
		if ( ! line ) {

			const material = new THREE.LineBasicMaterial( { color: 0xff0000 } );
			const geometry = new THREE.BufferGeometry();
			line = new THREE.Line( geometry, material );
			this.heightIndicators.set( key, line );
			this.helper.add( line );

		}

		// Update the height indicator
		const worldPos = this.tileToWorld( x, z );
		const points = [
			new THREE.Vector3( worldPos.x, 0, worldPos.z ),
			new THREE.Vector3( worldPos.x, tileData.height, worldPos.z )
		];
		line.geometry.setFromPoints( points );

	}

	setTileHeight( x, z, height ) {

		if ( ! this.isValidTile( x, z ) ) return;
		const tile = this.getTileData( x, z );
		tile.height = Math.max( 0, height );
		tile.isObstructed = height > 0;
		this.updateHeightIndicator( x, z );

	}

	// Calculate shadow cast by a tile
	calculateShadow( x, z, sunDirection ) {

		const tile = this.getTileData( x, z );
		if ( ! tile || ! tile.isObstructed ) return;

		// Simple ray-based shadow calculation
		const height = tile.height;
		const shadowLength = height * Math.abs( sunDirection.x / sunDirection.y );

		// Cast shadow on neighboring tiles
		for ( let dist = 1; dist <= shadowLength; dist ++ ) {

			const shadowX = x + Math.round( dist * Math.sign( sunDirection.x ) );
			const shadowHeight = height * ( 1 - dist / shadowLength );

			if ( this.isValidTile( shadowX, z ) ) {

				const shadowTile = this.getTileData( shadowX, z );
				shadowTile.shadowHeight = Math.max( shadowTile.shadowHeight, shadowHeight );

			}

		}

	}

	worldToTile( x, z ) {

		const tileX = Math.floor( ( x + this.worldWidth / 2 ) / this.tileSize );
		const tileZ = Math.floor( ( z + this.worldHeight / 2 ) / this.tileSize );
		return { x: tileX, z: tileZ };

	}

	tileToWorld( tileX, tileZ ) {

		const x = ( tileX * this.tileSize ) - ( this.worldWidth / 2 ) + ( this.tileSize / 2 );
		const z = ( tileZ * this.tileSize ) - ( this.worldHeight / 2 ) + ( this.tileSize / 2 );
		return { x, z };

	}

	getTileIndex( x, z ) {

		return z * this.width + x;

	}

	isValidTile( x, z ) {

		return x >= 0 && x < this.width && z >= 0 && z < this.height;

	}

	getTileData( x, z ) {

		if ( ! this.isValidTile( x, z ) ) return null;
		return this.tiles[ this.getTileIndex( x, z ) ];

	}

}
