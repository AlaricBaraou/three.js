import {
	Vector3,
	Matrix4,
	Object3D,
	ShadowBaseNode,
	Plane,
	Line3,
	Vector4,
	CameraHelper,
} from 'three/webgpu';

import { shadow, vec4, min, positionWorld, Fn, If, positionLocal, positionView, vec2 } from 'three/tsl';

class LwLight extends Object3D {

	constructor() {

		super();
		this.target = new Object3D();

	}

}

class TileShadowNode extends ShadowBaseNode {

	constructor( light, camera, scene ) {

		super( light );

		this.camera = camera;

		this.originalLight = light;
		this.lightPlane = new Plane( new Vector3().copy( light.position ).normalize(), light.position.length() );
		this.line = new Line3();

		this.shadowSize = {
			top: light.shadow.camera.top,
			bottom: light.shadow.camera.bottom,
			left: light.shadow.camera.left,
			right: light.shadow.camera.right
		};

		this.lights = [];
		this._shadowNodes = [];
		this._shadowCamHelper = [];

		// Define quadrant dimensions and resolutions
		this.quadrants = [
			{
				x: [ 0, 0.5 ], y: [ 0.5, 1 ], // Top Left
			},
			{
				x: [ 0.5, 1 ], y: [ 0.5, 1 ], // Top Right
			},
			{
				x: [ 0.5, 1 ], y: [ 0, 0.5 ], // Bottom Right
			},
			{
				x: [ 0, 0.5 ], y: [ 0, 0.5 ], // Bottom Left
			},
		];

		this.scene = scene;

	}

	init( { camera, renderer } ) {

		this.camera = camera;
		const light = this.originalLight;
		const parent = light.parent;

		// Create four lights, one for each quadrant
		for ( let i = 0; i < 4; i ++ ) {

			const lwLight = new LwLight();
			lwLight.castShadow = true;

			// Clone the original light's shadow properties
			const lShadow = light.shadow.clone();

			// Calculate the dimensions for this quadrant
			const quadrant = this.quadrants[ i ];
			const width = this.shadowSize.right - this.shadowSize.left;
			const height = this.shadowSize.top - this.shadowSize.bottom;

			// Set the shadow camera dimensions for this quadrant
			lShadow.camera.left = this.shadowSize.left + ( width * quadrant.x[ 0 ] );
			lShadow.camera.right = this.shadowSize.left + ( width * quadrant.x[ 1 ] );
			lShadow.camera.top = this.shadowSize.bottom + ( height * quadrant.y[ 1 ] );
			lShadow.camera.bottom = this.shadowSize.bottom + ( height * quadrant.y[ 0 ] );

			// Set different resolution for each quadrant
			lShadow.mapSize.width = i === 0 ? 4096 : 256;
			lShadow.mapSize.height = i === 0 ? 4096 : 256;

			// Maintain other shadow properties
			lShadow.bias = light.shadow.bias;
			lShadow.camera.near = light.shadow.camera.near;
			lShadow.camera.far = light.shadow.camera.far;
			lShadow.camera.userData.quadrantIndex = i;

			lwLight.shadow = lShadow;

			parent.add( lwLight );
			parent.add( lwLight.target );

			this.lights.push( lwLight );
			this._shadowNodes.push( shadow( lwLight, lShadow ) );

			console.log( `Quadrant ${i} initialized with resolution: ${quadrant.resolution}x${quadrant.resolution}` );

			this.currentShadowIndex = 0;

		}



		for ( let i = 0; i < 4; i ++ ) {

			this._shadowCamHelper[ i ] = new CameraHelper( this._shadowNodes[ i ].shadow.camera );
			this.scene.add( this._shadowCamHelper[ i ] );

		}

		this.originalLight.visible = false;

	}

	updateBefore() {

		const originalLight = this.originalLight;

		const camera = this.camera;

		// Update all split lights to match the original light's position and direction
		for ( const light of this.lights ) {

			light.position.copy( originalLight.position );
			light.target.position.copy( originalLight.target.position );
			light.intensity = originalLight.intensity;

			// Get camera world position
			const cameraPosition = camera.position.clone();

			// Project it into light's camera space
			cameraPosition.project( light.shadow.camera );

			if (
				cameraPosition.x > - 1 && cameraPosition.x < 1 &&
				cameraPosition.y > - 1 && cameraPosition.y < 1
			) {

				this.currentShadowIndex = light.shadow.camera.userData.quadrantIndex;

			}

		}

		console.log( this.currentShadowIndex );

		// this.line.set( new Vector3( 0, 0, 0 ), camera.position );
		// this.lightPlane.intersectLine( this.line, projectedPosition );

		// if ( Math.random() > 0.9 )
		// 	console.log( projectedPosition );

		// find in which cadrant the camera is
		// const cameraPosition = camera.position;
		// for ( let i = 0; i < this.quadrants.length; i ++ ) {

		// 	const quadrant = this.quadrants[ i ];
		// 	const x = projectedPosition.x;
		// 	const y = projectedPosition.y;
		// 	const z = projectedPosition.z;

		// 	if ( x >= this.shadowSize.left + ( this.shadowSize.right - this.shadowSize.left ) * quadrant.x[ 0 ] &&
		// 		x <= this.shadowSize.left + ( this.shadowSize.right - this.shadowSize.left ) * quadrant.x[ 1 ] &&
		// 		z >= this.shadowSize.bottom + ( this.shadowSize.top - this.shadowSize.bottom ) * quadrant.y[ 0 ] &&
		// 		z <= this.shadowSize.bottom + ( this.shadowSize.top - this.shadowSize.bottom ) * quadrant.y[ 1 ] ) {

		// 		this.currentShadowIndex = i;
		// 		break;

		// 	}

		// }

		const width = this.shadowSize.right - this.shadowSize.left;
		const height = this.shadowSize.top - this.shadowSize.bottom;

		const highResShadowIndex = this.currentShadowIndex;
		// const highResShadowIndex = this.currentShadowIndex % 4;

		// update high res coordinates
		const highResShadow = this._shadowNodes[ 0 ];
		const highResQuadrant = this.quadrants[ highResShadowIndex ];

		highResShadow.shadow.camera.left = this.shadowSize.left + ( width * highResQuadrant.x[ 0 ] );
		highResShadow.shadow.camera.right = this.shadowSize.left + ( width * highResQuadrant.x[ 1 ] );
		highResShadow.shadow.camera.top = this.shadowSize.bottom + ( height * highResQuadrant.y[ 1 ] );
		highResShadow.shadow.camera.bottom = this.shadowSize.bottom + ( height * highResQuadrant.y[ 0 ] );
		highResShadow.shadow.camera.updateProjectionMatrix();
		highResShadow.shadow.camera.userData.quadrantIndex = highResShadowIndex;
		// update low res coordinates
		for ( let i = 1; i < this._shadowNodes.length; i ++ ) {

			const lShadow = this._shadowNodes[ i ].shadow;
			const quadrantUpdt = this.quadrants[ i === highResShadowIndex ? 0 : i ];
			// Update orthographic camera frustum
			lShadow.camera.left = this.shadowSize.left + ( width * quadrantUpdt.x[ 0 ] );
			lShadow.camera.right = this.shadowSize.left + ( width * quadrantUpdt.x[ 1 ] );
			lShadow.camera.top = this.shadowSize.bottom + ( height * quadrantUpdt.y[ 1 ] );
			lShadow.camera.bottom = this.shadowSize.bottom + ( height * quadrantUpdt.y[ 0 ] );
			lShadow.camera.updateProjectionMatrix();
			lShadow.camera.userData.quadrantIndex = i === highResShadowIndex ? 0 : i;

		}

		highResShadow.shadow.needsUpdate = true;

	}

	setup( builder ) {

		if ( this.lights.length === 0 ) {

			this.init( builder );

		}

		return Fn( () => {

			let shadowValue = this._shadowNodes[ 0 ];

			// Combine with the rest of the shadow maps using min
			for ( let i = 1; i < this._shadowNodes.length; i ++ ) {

				shadowValue = min( shadowValue, this._shadowNodes[ i ] );

			}

			return vec4( 1, 1, 1, 1 ).mul( shadowValue );


		} )();

	}

	dispose() {

		for ( const light of this.lights ) {

			const parent = light.parent;
			if ( parent ) {

				parent.remove( light.target );
				parent.remove( light );

			}

		}

		this.originalLight.visible = true;
		super.dispose();

	}

}

export { TileShadowNode };
