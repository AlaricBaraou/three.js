function WebGLShader( gl, type, string, parameters ) {

	const shader = gl.createShader( type );

	gl.shaderSource( shader, string );
	gl.compileShader( shader );

	// some flag to check only if debug enabled
	if ( checkShaderErrors ) {

		if ( gl.getShaderParameter( shader, gl.COMPILE_STATUS ) === false ) {

			const errorMsg = gl.getShaderInfoLog( shader );
			console.error( 'Shader compilation failed: ' + errorMsg );

			// new method from material class
			parameters.material.onCompileError( shader, string, parameters.object );

		}

	}

	return shader;

}

export { WebGLShader };
