var objectsToDraw = [];
var objects = [];

function parseOBJ(text) {
  // because indices are base 1 let's just fill in the 0th data
  const objPositions = [[0, 0, 0]];
  const objTexcoords = [[0, 0]];
  const objNormals = [[0, 0, 0]];
  const objColors = [[0, 0, 0]];

  // same order as `f` indices
  const objVertexData = [
    objPositions,
    objTexcoords,
    objNormals,
    objColors,
  ];

  // same order as `f` indices
  let webglVertexData = [
    [],   // positions
    [],   // texcoords
    [],   // normals
    [],   // colors
  ];

  const materialLibs = [];
  const geometries = [];
  let geometry;
  let groups = ['default'];
  let material = 'default';
  let object = 'default';

  const noop = () => {};

  function newGeometry() {
    // If there is an existing geometry and it's
    // not empty then start a new one.
    if (geometry && geometry.data.position.length) {
      geometry = undefined;
    }
  }

  function setGeometry() {
    if (!geometry) {
      const position = [];
      const texcoord = [];
      const normal = [];
      const color = [];
      webglVertexData = [
        position,
        texcoord,
        normal,
        color,
      ];
      geometry = {
        object,
        groups,
        material,
        data: {
          position,
          texcoord,
          normal,
          color,
        },
      };
      geometries.push(geometry);
    }
  }

  function addVertex(vert) {
    const ptn = vert.split('/');
    ptn.forEach((objIndexStr, i) => {
      if (!objIndexStr) {
        return;
      }
      const objIndex = parseInt(objIndexStr);
      const index = objIndex + (objIndex >= 0 ? 0 : objVertexData[i].length);
      webglVertexData[i].push(...objVertexData[i][index]);
      // if this is the position index (index 0) and we parsed
      // vertex colors then copy the vertex colors to the webgl vertex color data
      if (i === 0 && objColors.length > 1) {
        geometry.data.color.push(...objColors[index]);
      }
    });
  }

  const keywords = {
    v(parts) {
      // if there are more than 3 values here they are vertex colors
      if (parts.length > 3) {
        objPositions.push(parts.slice(0, 3).map(parseFloat));
        objColors.push(parts.slice(3).map(parseFloat));
      } else {
        objPositions.push(parts.map(parseFloat));
      }
    },
    vn(parts) {
      objNormals.push(parts.map(parseFloat));
    },
    vt(parts) {
      // should check for missing v and extra w?
      objTexcoords.push(parts.map(parseFloat));
    },
    f(parts) {
      setGeometry();
      const numTriangles = parts.length - 2;
      for (let tri = 0; tri < numTriangles; ++tri) {
        addVertex(parts[0]);
        addVertex(parts[tri + 1]);
        addVertex(parts[tri + 2]);
      }
    },
    s: noop,    // smoothing group
    mtllib(parts) {
      // the spec says there can be multiple file here
      // but I found one with a space in the filename
      materialLibs.push(parts.join(' '));
    },
    usemtl(parts, unparsedArgs) {
      material = unparsedArgs;
      newGeometry();
    },
    g(parts) {
      groups = parts;
      newGeometry();
    },
    o(parts, unparsedArgs) {
      object = unparsedArgs;
      newGeometry();
    },
  };

  const keywordRE = /(\w*)(?: )*(.*)/;
  const lines = text.split('\n');
  for (let lineNo = 0; lineNo < lines.length; ++lineNo) {
    const line = lines[lineNo].trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const m = keywordRE.exec(line);
    if (!m) {
      continue;
    }
    const [, keyword, unparsedArgs] = m;
    const parts = line.split(/\s+/).slice(1);
    const handler = keywords[keyword];
    if (!handler) {
      console.warn('unhandled keyword:', keyword);  // eslint-disable-line no-console
      continue;
    }
    handler(parts, unparsedArgs);
  }

  // remove any arrays that have no entries.
  for (const geometry of geometries) {
    geometry.data = Object.fromEntries(
        Object.entries(geometry.data).filter(([, array]) => array.length > 0));
  }

  return {
    geometries,
    materialLibs,
  };
}

function parseMapArgs(unparsedArgs) {
  // TODO: handle options
  return unparsedArgs;
}

function parseMTL(text) {
  const materials = {};
  let material;

  const keywords = {
    newmtl(parts, unparsedArgs) {
      material = {};
      materials[unparsedArgs] = material;
    },
    /* eslint brace-style:0 */
    Ns(parts)       { material.shininess      = parseFloat(parts[0]); },
    Ka(parts)       { material.ambient        = parts.map(parseFloat); },
    Kd(parts)       { material.diffuse        = parts.map(parseFloat); },
    Ks(parts)       { material.specular       = parts.map(parseFloat); },
    Ke(parts)       { material.emissive       = parts.map(parseFloat); },
    map_Kd(parts, unparsedArgs)   { material.diffuseMap = parseMapArgs(unparsedArgs); },
    map_Ns(parts, unparsedArgs)   { material.specularMap = parseMapArgs(unparsedArgs); },
    map_Bump(parts, unparsedArgs) { material.normalMap = parseMapArgs(unparsedArgs); },
    Ni(parts)       { material.opticalDensity = parseFloat(parts[0]); },
    d(parts)        { material.opacity        = parseFloat(parts[0]); },
    illum(parts)    { material.illum          = parseInt(parts[0]); },
  };

  const keywordRE = /(\w*)(?: )*(.*)/;
  const lines = text.split('\n');
  for (let lineNo = 0; lineNo < lines.length; ++lineNo) {
    const line = lines[lineNo].trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const m = keywordRE.exec(line);
    if (!m) {
      continue;
    }
    const [, keyword, unparsedArgs] = m;
    const parts = line.split(/\s+/).slice(1);
    const handler = keywords[keyword];
    if (!handler) {
      console.warn('unhandled keyword:', keyword);  // eslint-disable-line no-console
      continue;
    }
    handler(parts, unparsedArgs);
  }

  return materials;
}

function makeIndexIterator(indices) {
  let ndx = 0;
  const fn = () => indices[ndx++];
  fn.reset = () => { ndx = 0; };
  fn.numElements = indices.length;
  return fn;
}

function makeUnindexedIterator(positions) {
  let ndx = 0;
  const fn = () => ndx++;
  fn.reset = () => { ndx = 0; };
  fn.numElements = positions.length / 3;
  return fn;
}

const subtractVector2 = (a, b) => a.map((v, ndx) => v - b[ndx]);

function generateTangents(position, texcoord, indices) {
  const getNextIndex = indices ? makeIndexIterator(indices) : makeUnindexedIterator(position);
  const numFaceVerts = getNextIndex.numElements;
  const numFaces = numFaceVerts / 3;

  const tangents = [];
  for (let i = 0; i < numFaces; ++i) {
    const n1 = getNextIndex();
    const n2 = getNextIndex();
    const n3 = getNextIndex();

    const p1 = position.slice(n1 * 3, n1 * 3 + 3);
    const p2 = position.slice(n2 * 3, n2 * 3 + 3);
    const p3 = position.slice(n3 * 3, n3 * 3 + 3);

    const uv1 = texcoord.slice(n1 * 2, n1 * 2 + 2);
    const uv2 = texcoord.slice(n2 * 2, n2 * 2 + 2);
    const uv3 = texcoord.slice(n3 * 2, n3 * 2 + 2);

    const dp12 = m4.subtractVectors(p2, p1);
    const dp13 = m4.subtractVectors(p3, p1);

    const duv12 = subtractVector2(uv2, uv1);
    const duv13 = subtractVector2(uv3, uv1);


    const f = 1.0 / (duv12[0] * duv13[1] - duv13[0] * duv12[1]);
    const tangent = Number.isFinite(f)
      ? m4.normalize(m4.scaleVector(m4.subtractVectors(
          m4.scaleVector(dp12, duv13[1]),
          m4.scaleVector(dp13, duv12[1]),
        ), f))
      : [1, 0, 0];

    tangents.push(...tangent, ...tangent, ...tangent);
  }

  return tangents;
}













async function main(objName) {
  const { gl, meshProgramInfo } = initializeWorld();

  async function readOBJ(){
    const objHref = objName;  
    const response = await fetch(objHref);
    const text = await response.text();
    const obj = parseOBJ(text);
    const baseHref = new URL(objHref, window.location.href);
    const matTexts = await Promise.all(obj.materialLibs.map(async filename => {
      const matHref = new URL(filename, baseHref).href;
      const response = await fetch(matHref);
      return await response.text();
    }));
    const materials = parseMTL(matTexts.join('\n'));
  
    const textures = {
      defaultWhite: twgl.createTexture(gl, {src: [255, 255, 255, 255]}),
      defaultNormal: twgl.createTexture(gl, {src: [127, 127, 255, 0]}),
    };
  
    for (const material of Object.values(materials)) {
      Object.entries(material)
        .filter(([key]) => key.endsWith('Map'))
        .forEach(([key, filename]) => {
          let texture = textures[filename];
          if (!texture) {
            const textureHref = new URL(filename, baseHref).href;
            texture = twgl.createTexture(gl, {src: textureHref, flipY: true});
            textures[filename] = texture;
          }
          material[key] = texture;
        });
    }
  
    Object.values(materials).forEach(m => {
      m.shininess = 25;
      m.specular = [3, 2, 1];
    });
  
    const defaultMaterial = {
      diffuse: [1, 1, 1],
      diffuseMap: textures.defaultWhite,
      normalMap: textures.defaultNormal,
      ambient: [0, 0, 0],
      specular: [1, 1, 1],
      specularMap: textures.defaultWhite,
      shininess: 400,
      opacity: 1,
    };
  
    const parts = obj.geometries.map(({material, data}) => {
      
      if (data.color) {
        if (data.position.length === data.color.length) {
          // it's 3. The our helper library assumes 4 so we need
          // to tell it there are only 3.
          data.color = { numComponents: 3, data: data.color };
        }
      } else {
        // there are no vertex colors so just use constant white
        data.color = { value: [1, 1, 1, 1] };
      }
  
      // generate tangents if we have the data to do so.
      if (data.texcoord && data.normal) {
        data.tangent = generateTangents(data.position, data.texcoord);
      } else {
        // There are no tangents
        data.tangent = { value: [1, 0, 0] };
      }
  
      if (!data.texcoord) {
        data.texcoord = { value: [0, 0] };
      }
  
      if (!data.normal) {
        // we probably want to generate normals if there are none
        data.normal = { value: [0, 0, 1] };
      }
  
      const bufferInfo = twgl.createBufferInfoFromArrays(gl, data);
      const vao = twgl.createVAOFromBufferInfo(gl, meshProgramInfo, bufferInfo);
      return {
        material: {
          ...defaultMaterial,
          ...materials[material],
        },
        bufferInfo,
        vao,
      };
    });
    
    objectsToDraw.push({
      partes: parts,
    });
  
    function getExtents(positions) {
      const min = positions.slice(0, 3);
      const max = positions.slice(0, 3);
      for (let i = 3; i < positions.length; i += 3) {
        for (let j = 0; j < 3; ++j) {
          const v = positions[i + j];
          min[j] = Math.min(v, min[j]);
          max[j] = Math.max(v, max[j]);
        }
      }
      return {min, max};
    }
  
    function getGeometriesExtents(geometries) {
      return geometries.reduce(({min, max}, {data}) => {
        const minMax = getExtents(data.position);
        return {
          min: min.map((min, ndx) => Math.min(minMax.min[ndx], min)),
          max: max.map((max, ndx) => Math.max(minMax.max[ndx], max)),
        };
      }, {
        min: Array(3).fill(Number.POSITIVE_INFINITY),
        max: Array(3).fill(Number.NEGATIVE_INFINITY),
      });
    }
  
    const extents = getGeometriesExtents(obj.geometries);
    const range = m4.subtractVectors(extents.max, extents.min);
    // amount to move the object so its center is at the origin
    const objOffset = m4.scaleVector(
        m4.addVectors(
          extents.min,
          m4.scaleVector(range, 0.5)),
        -1);
  }




  readOBJ('sword-01.obj');
  readOBJ('')
  const cameraTarget = [0, 0, 0];
  // figure out how far away to move the camera so we can likely
  // see the object.
  const radius = m4.length(range) * 0.5;
  const cameraPosition = m4.addVectors(cameraTarget, [
    0,
    0,
    radius,
  ]);
  // Set zNear and zFar to something hopefully appropriate
  // for the size of this object.
  const zNear = radius / 100;
  const zFar = radius * 3;

  function degToRad(deg) {
    return deg * Math.PI / 180;
  }


  
  var arrays = {
    position: [0, 0, 0, 15, 0, 0, 0, 30, 0, 15, 30, 0,       0, 0, 7, 15, 0, 7, 0, 30, 7, 15, 30, 7],
    texcoord: [0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 1],
    normal:   [0, 0, 1,    0, 0, 1,    0, 0, 1,  0, 0, 1,             0, 0, 1, 0, 0, 1,  0, 0, 1, 0, 0, 1,             0, 0, 1,  0, 1, 1,   0, 1, 1,   0, 1, 1,          0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,],
    indices:  [0, 1, 2, 1, 2, 3,    4, 5, 6, 5, 6, 7,    0, 2, 4, 2, 4, 6,        1, 3, 5, 3, 5, 7 ]
 };
  const translation = [0, 0, 0, 30, 30, -30, -30, 30, -30];
  var rotation = [degToRad(190), degToRad(40), degToRad(30), degToRad(190), degToRad(40),degToRad(30),degToRad(190), degToRad(40), degToRad(30)];

  //var bufferInfo = twgl.createBufferInfoFromArrays(gl, arrays);
  var i = 0
  
  /*const cubeVAO = twgl.createVAOFromBufferInfo(
    gl,
    meshProgramInfo,
    bufferInfo,
  );*/


  //var sphereBufferInfo = flattenedPrimitives.createSphereBufferInfo(gl, 10, 12, 6);
  //var sphereVAO = twgl.createVAOFromBufferInfo(gl, meshProgramInfo, sphereBufferInfo);


  //var coneBufferInfo   = flattenedPrimitives.createTruncatedConeBufferInfo(gl, 10, 0, 20, 12, 1, true, false);
  //var coneVAO   = twgl.createVAOFromBufferInfo(gl, meshProgramInfo, coneBufferInfo);


  //var fieldOfViewRadians = degToRad(60);
  //var cameraAngleRadians = degToRad(0);
  
  var rand = function(min, max) {
    if (max === undefined) {
      max = min;
      min = 0;
    }
    return min + Math.random() * (max - min);
  };

  var randInt = function(range) {
    return Math.floor(Math.random() * range);
  };


 /* var baseColor = rand(240);
  const cubeUniforms = {
    u_colorMult:             chroma.hsv(rand(baseColor, baseColor + 120), 0.5, 1).gl(),
    u_matrix:                m4.identity(),
    u_lightWorldPos:         [-50, 30, 100],
    u_viewInverse:           m4.identity(),
    u_lightColor:            [1, 1, 1, 1],
    u_world:                 m4.identity(),
    u_worldInverseTranspose: m4.identity(),
    u_diffuse:               textures[randInt(textures.length)],
    u_specular:              [1, 1, 1, 1],
    u_shininess:             rand(500),
    u_specularFactor:        rand(1),

  };*/

  yRotation = rand(Math.PI);
  xRotation = rand(Math.PI * 2);


  const elem = document.querySelector('#toggle');
  elem.addEventListener('click', () => {
    canvas.toBlob(() => {
      if (i == 0) {
        i = 3;
      }
      else if(i == 3) {
        i = 6;
      }
      else{
        i = 0;
      }
      counting = true;
      updateSlider(i);
      });
  });
  updateSlider(i);
  requestAnimationFrame(render);

function updateSlider(index)
{
  webglLessonsUI.setupSlider("#angleX", {value: radToDeg(rotation[index]), slide: updateRotation(index), max: 360});
  webglLessonsUI.setupSlider("#angleY", {value: radToDeg(rotation[index+1]), slide: updateRotation(index+1), max: 360});
  webglLessonsUI.setupSlider("#angleZ", {value: radToDeg(rotation[index+2]), slide: updateRotation(index+2), max: 360});
}
  function updatePosition(index) {
    return function(event, ui) {
      translation[index] = ui.value;
    };
  }

  function updateRotation(index) {
    return function(event, ui) {
      var angleInDegrees = ui.value;
      var angleInRadians = degToRad(angleInDegrees);
      rotation[index] = angleInRadians;
    };
  }

  function render(time) {
    /*var radius = 70;
    time = 1 + time * 0.001;
    twgl.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.enable(gl.DEPTH_TEST);
    //gl.enable(gl.CULL_FACE);


    
    var aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    var projectionMatrix = m4.perspective(fieldOfViewRadians, aspect, 1, 2000);

    //var cameraPosition = [0, 0, 100];
    //var target = [0, 0, 0];
    //var up = [0, 1, 0];
    //var cameraMatrix = m4.lookAt(cameraPosition, target, up,cubeUniforms.u_viewInverse);
    var cameraMatrix = m4.yRotation(degToRad(20 * time));
    cameraMatrix = m4.translate(cameraMatrix, 0, 30, radius * 1.5);
  
    var viewMatrix = m4.inverse(cameraMatrix);

    var viewProjectionMatrix = m4.multiply(projectionMatrix, viewMatrix);




    gl.useProgram(meshProgramInfo.program);
*/

  time *= 0.001;  // convert to seconds

  twgl.resizeCanvasToDisplaySize(gl.canvas);
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.enable(gl.DEPTH_TEST);

  const fieldOfViewRadians = degToRad(60);
  const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
  const projection = m4.perspective(fieldOfViewRadians, aspect, zNear, zFar);

  const up = [0, 1, 0];
// Compute the camera's matrix using look at.
  const camera = m4.lookAt(cameraPosition, cameraTarget, up);

// Make a view matrix from the camera matrix.
  const view = m4.inverse(camera);

  const sharedUniforms = {
    u_lightDirection: m4.normalize([-1, 3, 5]),
    u_view: view,
    u_projection: projection,
    u_viewWorldPosition: cameraPosition,
  };

  gl.useProgram(meshProgramInfo.program);

// calls gl.uniform
  twgl.setUniforms(meshProgramInfo, sharedUniforms);


  
  objectsToDraw.forEach(function(object){
    let u_world =  m4.identity();
    //let u_world = m4.yRotation(time);
    u_world = m4.translate(u_world, ...objOffset);
    u_world = m4.translate(u_world, translation[i], translation[i+1], translation[i+2]);
    u_world = m4.xRotate(u_world, rotation[0]);
    u_world = m4.yRotate(u_world, rotation[1]);
    u_world = m4.zRotate(u_world, rotation[2]);
    i = i + 3
    for (const {bufferInfo, vao, material} of object.partes) {
      gl.bindVertexArray(vao);
      twgl.setUniforms(meshProgramInfo, {
        u_world,
      }, material);
      twgl.drawBufferInfo(gl, bufferInfo);
    }
  });

/*
 
    gl.bindVertexArray(cubeVAO);
    var worldMatrix = m4.identity();
    
    //worldMatrix = m4.yRotate(worldMatrix, yRotation * time);

    worldMatrix = m4.translate(worldMatrix, translation[0], translation[1], translation[2]);

    worldMatrix = m4.xRotate(worldMatrix, rotation[0]);
    worldMatrix = m4.yRotate(worldMatrix, rotation[1]);
    worldMatrix = m4.zRotate(worldMatrix, rotation[2]);
    //worldMatrix = m4.xRotate(worldMatrix, xRotation * time);

    m4.multiply(viewProjectionMatrix, worldMatrix, cubeUniforms.u_matrix);
    
    //m4.transpose(m4.inverse(worldMatrix), cubeUniforms.u_worldInverseTranspose);


    twgl.setUniforms(meshProgramInfo, cubeUniforms);

    twgl.drawBufferInfo(gl, bufferInfo);



    gl.bindVertexArray()
    var worldMatrix2 = m4.identity();
    //worldMatrix2 = m4.yRotate(worldMatrix2, yRotation * time);

    worldMatrix2 = m4.translate(worldMatrix2, translation[3], translation[4], translation[5]);

    worldMatrix2 = m4.xRotate(worldMatrix2, rotation[3]);
    worldMatrix2 = m4.yRotate(worldMatrix2, rotation[4]);
    worldMatrix2 = m4.zRotate(worldMatrix2, rotation[5]);
    //worldMatrix = m4.xRotate(worldMatrix, xRotation * time);

    m4.multiply(viewProjectionMatrix, worldMatrix2, cubeUniforms.u_matrix);
    
    //m4.transpose(m4.inverse(worldMatrix), cubeUniforms.u_worldInverseTranspose);


    twgl.setUniforms(meshProgramInfo, cubeUniforms);

    twgl.drawBufferInfo(gl, sphereBufferInfo);


    gl.bindVertexArray(coneVAO)
    var worldMatrix3 = m4.identity();
    //worldMatrix2 = m4.yRotate(worldMatrix2, yRotation * time);

    worldMatrix3 = m4.translate(worldMatrix3, translation[6], translation[7], translation[8]);

    worldMatrix3 = m4.xRotate(worldMatrix3, rotation[6]);
    worldMatrix3 = m4.yRotate(worldMatrix3, rotation[7]);
    worldMatrix3 = m4.zRotate(worldMatrix3, rotation[8]);
    //worldMatrix = m4.xRotate(worldMatrix, xRotation * time);

    m4.multiply(viewProjectionMatrix, worldMatrix3, cubeUniforms.u_matrix);
    
    //m4.transpose(m4.inverse(worldMatrix), cubeUniforms.u_worldInverseTranspose);


    twgl.setUniforms(meshProgramInfo, cubeUniforms);

    twgl.drawBufferInfo(gl, coneBufferInfo);
*/
	  requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
}
main();
