import * as THREE from 'three';

// --- GLSL Shaders ---
const computeVertexShader = /*glsl*/`#version 300 es
    precision highp float;

    // --- Uniforms ---
    uniform float time;
    uniform float uMaxCurves;
    uniform int uMaxSegments;
    uniform sampler2D uCurveTexture;
    uniform sampler2D uSnakesTexture;

    // --- Inputs from Buffers ---
    in int inState;            // (location = 0) Last known curve ID
    in int inSnakeId;          // (location = 1) Which snake path to follow
    in float inSnakePathLength; // (location = 2) Total length of the snake path
    in float inOffsetInSnake;  // (location = 3) Initial progress offset [0-1]
    in vec3 inPosition;         // (location = 4) Previous frame's position

    // --- Outputs to Transform Feedback Buffers ---
    flat out int outState;
    out vec3 outPosition;
    out vec4 outQuaternion;

    // --- Constants ---
    const float SPEED = 4.0;
    const int MAX_SEGMENTS = 32;
    const vec3 DEFAULT_FORWARD = vec3(0.0, 1.0, 0.0);

    // --- Helper Functions ---
    vec4 quatFromVectors(vec3 a, vec3 b) {
        float dotProduct = dot(a, b);
        vec3 axis = normalize(cross(a, b));
        float angle = acos(dotProduct);
        float halfAngle = angle * 0.5;
        float s = sin(halfAngle);
        return vec4(axis.x * s, axis.y * s, axis.z * s, cos(halfAngle));
    }

    void main() {
        int prevCurveId = inState;

        // Calculate the particle's new total progress along its entire snake path
        float newTotalProgress = mod(inOffsetInSnake * inSnakePathLength + time * SPEED, inSnakePathLength);

        float foundCurveId = 0.0;
        float newProgOnCurve = 0.0;
        bool isFound = false;

        // Search for the current segment, starting from the last known one
        for (int i = prevCurveId; i < uMaxSegments; i++) {
            vec4 segmentData = texelFetch(uSnakesTexture, ivec2(i, inSnakeId), 0);
            if (segmentData.y == 0.0) break; // End of path

            float segmentEndCumulative = segmentData.z;
            if (newTotalProgress <= segmentEndCumulative) {
                float segmentLength = segmentData.y;
                float segmentStart = segmentEndCumulative - segmentLength;
                float progressOnSegment = newTotalProgress - segmentStart;
                float direction = segmentData.w;

                foundCurveId = segmentData.x;
                newProgOnCurve = direction > 0.0 ? (progressOnSegment / segmentLength) : (1.0 - progressOnSegment / segmentLength);
                isFound = true;
                break;
            }
        }

        // If not found (due to looping), search from the beginning
        if (!isFound) {
            for (int i = 0; i < prevCurveId; i++) {
                vec4 segmentData = texelFetch(uSnakesTexture, ivec2(i, inSnakeId), 0);
                if (segmentData.y == 0.0) break;

                float segmentEndCumulative = segmentData.z;
                if (newTotalProgress <= segmentEndCumulative) {
                    float segmentLength = segmentData.y;
                    float segmentStart = segmentEndCumulative - segmentLength;
                    float progressOnSegment = newTotalProgress - segmentStart;
                    float direction = segmentData.w;

                    foundCurveId = segmentData.x;
                    newProgOnCurve = direction > 0.0 ? (progressOnSegment / segmentLength) : (1.0 - progressOnSegment / segmentLength);
                    break;
                }
            }
        }

        // Get the new position from the curve texture
        float curveV = (foundCurveId + 0.5) / uMaxCurves;
        vec2 nextPosUV = vec2(newProgOnCurve, curveV);
        vec3 nextPos = texture(uCurveTexture, nextPosUV).xyz;

        // Calculate rotation quaternion
        vec3 direction = normalize(nextPos - inPosition);
        outQuaternion = quatFromVectors(DEFAULT_FORWARD, direction);

        // Set output values
        outPosition = nextPos;
        outState = int(foundCurveId);
    }
`;

const computeFragmentShader = /*glsl*/`#version 300 es
    void main() {}
`;

const particleVertexShader = /*glsl*/`
    precision highp float;
    attribute vec3 instancePosition;
    attribute vec4 instanceQuaternion;
    attribute int aSnakeId;
    uniform sampler2D tSnakesMetadata;
    varying vec3 vColor;
    varying vec2 vUv;

    vec3 applyQuaternion(vec3 pos, vec4 q) {
        return pos + 2.0 * cross(q.xyz, cross(q.xyz, pos) + q.w * pos);
    }

    void main() {
        vUv = uv;
        vColor = texelFetch(tSnakesMetadata, ivec2(0, aSnakeId), 0).rgb;
        
        vec3 objectUp_world = applyQuaternion(vec3(0.0, 1.0, 0.0), instanceQuaternion);
        vec3 lookAt_world = cameraPosition - instancePosition;
        vec3 billboardForward = lookAt_world - dot(lookAt_world, objectUp_world) * objectUp_world;
        billboardForward = normalize(billboardForward);
        vec3 billboardRight = normalize(cross(objectUp_world, billboardForward));
        vec3 finalWorldPosition = instancePosition + billboardRight * position.x + objectUp_world * position.y + billboardForward * position.z;
        gl_Position = projectionMatrix * viewMatrix * vec4(finalWorldPosition, 1.0);
    }
`;

const particleFragmentShader = /*glsl*/`
    precision highp float;
    varying vec3 vColor;
    varying vec2 vUv;

    float sdEgg(in vec2 p, in float ra, in float rb) {
        const float k = sqrt(3.0);
        p.x = abs(p.x);
        float r = ra - rb;
        return ((p.y < 0.0) ? length(vec2(p.x, p.y)) - r :
               (k * (p.x + r) < p.y) ? length(vec2(p.x, p.y - k * r)) :
               length(vec2(p.x + r, p.y)) - 2.0 * r) - rb;
    }

    void main() {
        vec2 p = vUv - 0.5;
        float distance = sdEgg(p, 0.25, 0.01);
        float alpha = 1.0 - smoothstep(-0.01, 0.01, distance);
        if (alpha < 0.05) {
            discard;
        }

        // The vertical UV coordinate serves as our gradient factor (0.0 to 1.0)
        float gradientFactor = vUv.y;

        // Define light and dark colors based on the main instance color
        vec3 lightColor = vColor + vec3(0.6);
        vec3 darkColor = vColor * 0.4;

        // Create the three-stop gradient
        vec3 finalColor;
        if (gradientFactor < 0.5) {
            // From 0.0 to 0.5, mix from light to main color
            float t = gradientFactor * 2.0;
            finalColor = mix(lightColor, vColor, t);
        } else {
            // From 0.5 to 1.0, mix from main to dark color
            float t = (gradientFactor - 0.5) * 2.0;
            finalColor = mix(vColor, darkColor, t);
        }

        gl_FragColor = vec4(finalColor, alpha);

        #include <colorspace_fragment>
    }
`;


/**
 * A helper class for compiling GLSL shaders and managing transform feedback.
 */
class GLShader {
    constructor(gl) {
        this.gl = gl;
        this.prog = null;
        this.uniforms = {};
    }

    compile(vSrc, fSrc, tfVarying = null) {
        const vSh = this._compileShader(vSrc, true);
        if (!vSh) return false;

        const fSh = this._compileShader(fSrc, false);
        if (!fSh) {
            this.gl.deleteShader(vSh);
            return false;
        }

        this.prog = this._linkProgram(vSh, fSh, tfVarying);
        return !!this.prog;
    }

    useUniforms(ary) {
        for (const i of ary) {
            this.uniforms[i] = this.gl.getUniformLocation(this.prog, i);
        }
        return this;
    }

    _compileShader(src, isVert = true) {
        const sh = this.gl.createShader(isVert ? this.gl.VERTEX_SHADER : this.gl.FRAGMENT_SHADER);
        this.gl.shaderSource(sh, src);
        this.gl.compileShader(sh);

        if (!this.gl.getShaderParameter(sh, this.gl.COMPILE_STATUS)) {
            console.error("SHADER COMPILE ERROR:", this.gl.getShaderInfoLog(sh));
            this.gl.deleteShader(sh);
            return null;
        }
        return sh;
    }

    _linkProgram(vSh, fSh, tfVarying = null) {
        const prog = this.gl.createProgram();
        this.gl.attachShader(prog, vSh);
        this.gl.attachShader(prog, fSh);

        if (tfVarying) {
            this.gl.transformFeedbackVaryings(prog, tfVarying, this.gl.SEPARATE_ATTRIBS);
        }

        this.gl.linkProgram(prog);
        this.gl.deleteShader(vSh);
        this.gl.deleteShader(fSh);

        if (!this.gl.getProgramParameter(prog, this.gl.LINK_STATUS)) {
            console.error("LINK ERROR:", this.gl.getProgramInfoLog(prog));
            this.gl.deleteProgram(prog);
            return null;
        }
        return prog;
    }
}


/**
 * Encapsulates the entire Transform Feedback simulation.
 */
export class TransformFeedbackSystem {
    constructor(renderer, {
        particleCount = 10000,
        snakeCount = 5000,
        curveCount = 5000,
        pointsPerCurve = 50,
        maxSegmentsPerSnake = 32,
        spreadRange = 150
    }) {
        this.renderer = renderer;
        this.gl = this.renderer.getContext();
        this.config = { particleCount, snakeCount, curveCount, pointsPerCurve, maxSegmentsPerSnake, spreadRange };
        this.iteration = 0;

        // Public properties
        this.mesh = null; // The final renderable mesh
        this.curves = [];
        this.snakes = [];

        // Internal state
        this._buffers = {};
        this._textures = {};
        this._computeShader = null;
        this._feedbackObject = null;
        this._vao = null;
    }

    init() {
        this._generateAllPathsAndTextures();
        this._setupBuffers();
        this._setupMesh();
        this._setupCompute();
    }

    // --- NEW: Helper for creating a random point ---
    _getRandomPoint() {
        const { spreadRange } = this.config;
        return new THREE.Vector3(
            (Math.random() - 0.5) * spreadRange,
            (Math.random() - 0.5) * spreadRange,
            (Math.random() - 0.5) * spreadRange
        );
    }

    // --- NEW: Generates a single random curve and its metadata ---
    _createRandomCurve() {
        const { pointsPerCurve } = this.config;
        const curve = new THREE.CubicBezierCurve3(
            this._getRandomPoint(), this._getRandomPoint(), this._getRandomPoint(), this._getRandomPoint()
        );
        const length = curve.getLength();
        const points = curve.getSpacedPoints(pointsPerCurve - 1);
        return { points, length };
    }

    // --- NEW: Generates a single snake path by referencing existing curves ---
    _createRandomSnakePath() {
        const { maxSegmentsPerSnake } = this.config;
        const segments = [];
        let totalLength = 0;

        for (let i = 0; i < maxSegmentsPerSnake; i++) {
            const randomCurveIndex = Math.floor(Math.random() * this.curves.length);
            const curveData = this.curves[randomCurveIndex];
            const segmentLength = curveData.length;
            totalLength += segmentLength;

            segments.push({
                curveId: randomCurveIndex,
                length: segmentLength,
                cumulativeEnd: totalLength,
                direction: Math.random() > 0.5 ? 1.0 : -1.0,
            });
        }
        
        return {
            segments,
            totalLength,
            color: new THREE.Color(Math.random() * 0xffffff),
        };
    }

    // --- REFACTORED: Main orchestrator for data generation and texture creation ---
    _generateAllPathsAndTextures() {
        const { curveCount, pointsPerCurve, snakeCount, maxSegmentsPerSnake } = this.config;

        // 1. Generate structured curve and snake data
        for (let i = 0; i < curveCount; i++) {
            this.curves.push(this._createRandomCurve());
        }
        for (let i = 0; i < snakeCount; i++) {
            this.snakes.push(this._createRandomSnakePath());
        }

        // 2. Flatten structured data into Float32Arrays for GPU textures
        const curveTextureData = new Float32Array(curveCount * pointsPerCurve * 4);
        const snakesTextureData = new Float32Array(snakeCount * maxSegmentsPerSnake * 4);
        const snakesMetadata = new Float32Array(snakeCount * 4);

        // Populate curve texture data
        this.curves.forEach((curve, i) => {
            curve.points.forEach((point, j) => {
                const index = (i * pointsPerCurve + j) * 4;
                curveTextureData[index + 0] = point.x;
                curveTextureData[index + 1] = point.y;
                curveTextureData[index + 2] = point.z;
                curveTextureData[index + 3] = curve.length;
            });
        });

        // Populate snakes texture and metadata data
        this.snakes.forEach((snake, i) => {
            snake.segments.forEach((segment, j) => {
                const flatIndex = (i * maxSegmentsPerSnake + j) * 4;
                snakesTextureData[flatIndex + 0] = segment.curveId;
                snakesTextureData[flatIndex + 1] = segment.length;
                snakesTextureData[flatIndex + 2] = segment.cumulativeEnd;
                snakesTextureData[flatIndex + 3] = segment.direction;
            });
            snakesMetadata[i * 4 + 0] = snake.color.r;
            snakesMetadata[i * 4 + 1] = snake.color.g;
            snakesMetadata[i * 4 + 2] = snake.color.b;
            snakesMetadata[i * 4 + 3] = snake.totalLength;
        });

        // 3. Create and configure the DataTextures
        this._textures.curveTexture = new THREE.DataTexture(curveTextureData, pointsPerCurve, curveCount, THREE.RGBAFormat, THREE.FloatType);
        this._textures.curveTexture.minFilter = THREE.LinearFilter;
        this._textures.curveTexture.magFilter = THREE.LinearFilter;
        this._textures.curveTexture.needsUpdate = true;

        this._textures.snakesTexture = new THREE.DataTexture(snakesTextureData, maxSegmentsPerSnake, snakeCount, THREE.RGBAFormat, THREE.FloatType);
        this._textures.snakesTexture.minFilter = THREE.NearestFilter;
        this._textures.snakesTexture.magFilter = THREE.NearestFilter;
        this._textures.snakesTexture.needsUpdate = true;
        
        this._textures.snakesMetadataTexture = new THREE.DataTexture(snakesMetadata, 1, snakeCount, THREE.RGBAFormat, THREE.FloatType);
        this._textures.snakesMetadataTexture.minFilter = THREE.NearestFilter;
        this._textures.snakesMetadataTexture.magFilter = THREE.NearestFilter;
        this._textures.snakesMetadataTexture.needsUpdate = true;
        
        // Store raw data needed for buffer setup
        this._textures.snakesMetadata = snakesMetadata;
    }

    _setupBuffers() {
        const { particleCount, snakeCount } = this.config;

        // --- Create CPU-side arrays for initial data ---
        const particleIDs = new Int32Array(particleCount).map(() => Math.floor(Math.random() * snakeCount));
        const offsetInSnake = new Float32Array(particleCount).map(Math.random);
        const snakePathLengths = new Float32Array(particleCount).map((_, i) => this._textures.snakesMetadata[particleIDs[i] * 4 + 3]);
        const initialStates = new Int32Array(particleCount).fill(0); // All start at curveId 0
        const initialPositions = new Float32Array(particleCount * 3).fill(0); // Start at origin
        const initialQuaternions = new Float32Array(particleCount * 4).fill(0);

        // --- Create GPU BufferAttributes ---
        this._buffers.snakeId = new THREE.BufferAttribute(particleIDs, 1).setUsage(
            THREE.DynamicDrawUsage
        )
        this._buffers.snakeId.gpuType = THREE.IntType;
		this._buffers.snakeId.needsUpdate = true;

        this._buffers.offsetInSnake = new THREE.BufferAttribute(offsetInSnake, 1).setUsage(
            THREE.DynamicDrawUsage
        )
        this._buffers.snakePathLength = new THREE.BufferAttribute(snakePathLengths, 1).setUsage(
            THREE.DynamicDrawUsage
        )

        this._buffers.state_read = new THREE.BufferAttribute(initialStates, 1).setUsage(
            THREE.DynamicDrawUsage
        )
        this._buffers.state_read.gpuType = THREE.IntType;
        this._buffers.state_write = this._buffers.state_read.clone();

        this._buffers.position_read = new THREE.InstancedBufferAttribute(initialPositions, 3).setUsage(
            THREE.DynamicDrawUsage
        )
        this._buffers.position_write = this._buffers.position_read.clone();
        
        this._buffers.quaternion = new THREE.InstancedBufferAttribute(initialQuaternions, 4).setUsage(
            THREE.DynamicDrawUsage
        )
        this._buffers.snakeIdInst = new THREE.InstancedBufferAttribute(particleIDs, 1).setUsage(
            THREE.DynamicDrawUsage
        )
        this._buffers.snakeIdInst.gpuType = THREE.IntType;
		this._buffers.snakeIdInst.needsUpdate = true;

        // --- Force upload to GPU ---
        Object.values(this._buffers).forEach(buffer => {
            this.renderer.attributes.update(buffer, this.gl.ARRAY_BUFFER);
        });
    }

    _setupMesh() {
        const { particleCount } = this.config;
        const baseGeometry = new THREE.PlaneGeometry(1, 1);
        const instancedGeometry = new THREE.InstancedBufferGeometry();
        instancedGeometry.copy(baseGeometry);
        instancedGeometry.instanceCount = particleCount;

        // These attributes will be updated by the transform feedback
        instancedGeometry.setAttribute('instancePosition', this._buffers.position_read);
        instancedGeometry.setAttribute('instanceQuaternion', this._buffers.quaternion);
        instancedGeometry.setAttribute('aSnakeId', this._buffers.snakeIdInst);

        const material = new THREE.ShaderMaterial({
            uniforms: {
                tSnakesMetadata: { value: this._textures.snakesMetadataTexture }
            },
            vertexShader: particleVertexShader,
            fragmentShader: particleFragmentShader,
            transparent: true,
        });

        this.mesh = new THREE.Mesh(instancedGeometry, material);
        this.mesh.frustumCulled = false;
    }

    _setupCompute() {
        this._feedbackObject = this.gl.createTransformFeedback();
        this._vao = this.gl.createVertexArray();

        // Compile the compute shader
        this._computeShader = new GLShader(this.gl);
        this._computeShader.compile(computeVertexShader, computeFragmentShader, ["outState", "outPosition", "outQuaternion"]);
        this._computeShader.useUniforms(["time", "uMaxCurves", "uCurveTexture", "uSnakesTexture", "uMaxSegments"]);
        
        // Ensure textures are ready on the GPU
        this.renderer.initTexture(this._textures.curveTexture);
        this.renderer.initTexture(this._textures.snakesTexture);
        this.renderer.initTexture(this._textures.snakesMetadataTexture);
    }
    
    update(elapsedTime, camera) {
        this.iteration++;
        
        // --- Get WebGL buffer info from three.js's attribute manager ---
        const isEvenFrame = this.iteration % 2 === 0;
        const readStateBufferInfo = this.renderer.attributes.get(isEvenFrame ? this._buffers.state_read : this._buffers.state_write);
        const writeStateBufferInfo = this.renderer.attributes.get(isEvenFrame ? this._buffers.state_write : this._buffers.state_read);
        const readPositionBufferInfo = this.renderer.attributes.get(isEvenFrame ? this._buffers.position_read : this._buffers.position_write);
        const writePositionBufferInfo = this.renderer.attributes.get(isEvenFrame ? this._buffers.position_write : this._buffers.position_read);
        const quaternionBufferInfo = this.renderer.attributes.get(this._buffers.quaternion);

        // Static buffers (don't ping-pong)
        const idBufferInfo = this.renderer.attributes.get(this._buffers.snakeId);
        const snakePathLengthBufferInfo = this.renderer.attributes.get(this._buffers.snakePathLength);
        const offsetInSnakeBufferInfo = this.renderer.attributes.get(this._buffers.offsetInSnake);
        
        if (!writeStateBufferInfo) return; // Buffers not ready yet

        // --- Prepare WebGL state for compute pass ---
        this.gl.bindVertexArray(this._vao);

        // --- Bind Input Buffers (Attributes for the compute shader) ---
        // location = 0: inState
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, readStateBufferInfo.buffer);
        this.gl.vertexAttribIPointer(0, 1, this.gl.INT, 0, 0);
        this.gl.enableVertexAttribArray(0);

        // location = 1: inSnakeId
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, idBufferInfo.buffer);
        this.gl.vertexAttribIPointer(1, 1, this.gl.INT, 0, 0);
        this.gl.enableVertexAttribArray(1);

        // location = 2: inSnakePathLength
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, snakePathLengthBufferInfo.buffer);
        this.gl.vertexAttribPointer(2, 1, this.gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(2);
        
        // location = 3: inOffsetInSnake
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, offsetInSnakeBufferInfo.buffer);
        this.gl.vertexAttribPointer(3, 1, this.gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(3);

        // location = 4: inPosition
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, readPositionBufferInfo.buffer);
        this.gl.vertexAttribPointer(4, 3, this.gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(4);

        // --- Bind Textures ---
        this.renderer.state.bindTexture(this.gl.TEXTURE_2D, this.renderer.properties.get(this._textures.curveTexture).__webglTexture, this.gl.TEXTURE0);
        this.renderer.state.bindTexture(this.gl.TEXTURE_2D, this.renderer.properties.get(this._textures.snakesTexture).__webglTexture, this.gl.TEXTURE1);
        
        // --- Activate Shader and Set Uniforms ---
        this.gl.useProgram(this._computeShader.prog);
        this.gl.uniform1f(this._computeShader.uniforms.time, elapsedTime);
        this.gl.uniform1f(this._computeShader.uniforms.uMaxCurves, this.config.curveCount);
        this.gl.uniform1i(this._computeShader.uniforms.uCurveTexture, 0);
        this.gl.uniform1i(this._computeShader.uniforms.uSnakesTexture, 1);
        this.gl.uniform1i(this._computeShader.uniforms.uMaxSegments, this.config.maxSegmentsPerSnake);

        // --- Execute Transform Feedback ---
        this.gl.enable(this.gl.RASTERIZER_DISCARD);
        this.gl.bindTransformFeedback(this.gl.TRANSFORM_FEEDBACK, this._feedbackObject);
        
        // Bind Output Buffers
        this.gl.bindBufferBase(this.gl.TRANSFORM_FEEDBACK_BUFFER, 0, writeStateBufferInfo.buffer);
        this.gl.bindBufferBase(this.gl.TRANSFORM_FEEDBACK_BUFFER, 1, writePositionBufferInfo.buffer);
        this.gl.bindBufferBase(this.gl.TRANSFORM_FEEDBACK_BUFFER, 2, quaternionBufferInfo.buffer);

        this.gl.beginTransformFeedback(this.gl.POINTS);
        this.gl.drawArrays(this.gl.POINTS, 0, this.config.particleCount);
        this.gl.endTransformFeedback();
        
        // --- Clean up WebGL state ---
        this.gl.disable(this.gl.RASTERIZER_DISCARD);
        this.gl.bindTransformFeedback(this.gl.TRANSFORM_FEEDBACK, null);
        this.gl.bindVertexArray(null);
        this.gl.useProgram(null);
        
        // --- Swap buffers for the next frame ---
        // This is done by updating the geometry attribute to point to the buffer we just wrote to.
        this.mesh.geometry.setAttribute('instancePosition', isEvenFrame ? this._buffers.position_write : this._buffers.position_read);
    }
}