var objectsToDraw = [];
var objects = [];
var range;
var extents;
    
var objOffset;
var cameraTarget 
var radius;
var cameraPosition;
var counterFrames = 0;
        
var zNear;
var zFar;
var storedTime = 0;
var counter = 101;

var right = true;

function parseOBJ(text) {
  const objPositions = [[0, 0, 0]];
  const objTexcoords = [[0, 0]];
  const objNormals = [[0, 0, 0]];
  const objColors = [[0, 0, 0]];
  const objVertexData = [
    objPositions,
    objTexcoords,
    objNormals,
    objColors,
  ];
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
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

async function main() {

  const { gl, meshProgramInfo } = initializeWorld();

  async function readOBJ(objName){
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
      
          data.color = { numComponents: 3, data: data.color };
        }
      } else {
        data.color = { value: [1, 1, 1, 1] };
      }
      if (data.texcoord && data.normal) {
        data.tangent = generateTangents(data.position, data.texcoord);
      } else {
        
        data.tangent = { value: [1, 0, 0] };
      }
      if (!data.texcoord) {
        data.texcoord = { value: [0, 0] };
      }
      if (!data.normal) {
       
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
    extents = getGeometriesExtents(obj.geometries);
    range = m4.subtractVectors(extents.max, extents.min);
    objOffset = m4.scaleVector(
        m4.addVectors(
          extents.min,
          m4.scaleVector(range, 0.5)),
        -1);
    cameraTarget = [0, 0, 0];
  
    radius = m4.length(range) * 0.5;
    cameraPosition = m4.addVectors(cameraTarget, [
        0,
        0,
        100,
    ]);      
    zNear = radius / 1000;
    zFar = radius * 1000;
    objectsToDraw.push({
      nome: objName,
      partes: parts,
      offset: objOffset,
    });
      
  }
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  var i = 3;
  var j = 0;

  await readOBJ('/boilerplate/Models/Sword1/sword-01.obj');
  await readOBJ('/boilerplate/Models/Sword2/KubikiribochoEND.obj');
  await readOBJ('/boilerplate/Models/Sword3/Sting-Sword-lowpoly.obj');
  await readOBJ('/boilerplate/Models/Sword4/w026.obj');
  await readOBJ('/boilerplate/Models/Sword5/Ancient Sword.obj')
  await readOBJ('/boilerplate/Models/Sword6/swB.obj')
  await readOBJ('/boilerplate/Models/Sword7/Sword.obj')

  var rotation = [degToRad(190), degToRad(40), degToRad(30), degToRad(190), degToRad(40), degToRad(30), degToRad(190), degToRad(40), degToRad(30), degToRad(190), degToRad(40), degToRad(30), degToRad(190), degToRad(40), degToRad(30), degToRad(190), degToRad(40), degToRad(30), degToRad(190), degToRad(40), degToRad(30)
  ];
  var cameraZoom = 60;
  var rand = function(min, max) {
    if (max === undefined) {
      max = min;
      min = 0;
    }
    return min + Math.random() * (max - min);
  };


  function updateSlider(index)
  {
    webglLessonsUI.setupSlider("#angleX", {value: radToDeg(rotation[index]), slide: updateRotation(index), max: 360});
    webglLessonsUI.setupSlider("#angleY", {value: radToDeg(rotation[index+1]), slide: updateRotation(index+1), max: 360});
    webglLessonsUI.setupSlider("#angleZ", {value: radToDeg(rotation[index+2]), slide: updateRotation(index+2), max: 360});
    webglLessonsUI.setupSlider("#zoom", {value: radToDeg(cameraZoom), slide: updateZoom(),min: 30, max: 50});
  }

  function updateRotation(index) {
    return function(event, ui) {     
       var angleInDegrees = ui.value;
      var angleInRadians = degToRad(angleInDegrees);
      rotation[index] = angleInRadians;
    };
  }

  function updateZoom() {
    return function(event, ui) {
      cameraZoom = ui.value;
    };
  }

  const elem = document.querySelector('#toggleright');
  elem.addEventListener('click', () => {
    canvas.toBlob(() => {
      if (i == 0) {
        i = 9;                              
      }
      else if(i == 3) {
        i = 0;
      }
      else if(i == 6){
        i = 3;
      }
      else{
        i =6;
      }
      counter = 0;
      right = true;
      updateSlider(i);
      });
  });

  const elem2 = document.querySelector('#toggleleft');          
  elem2.addEventListener('click', () => {
    canvas.toBlob(() => {
      if (i == 0) {                          
        i = 3;
      }
      else if(i == 3) {
        i = 6;
      }
      else if(i == 6){
        i = 9;
      }
      else{
        i = 0;
      }
      counter = 0;
      right = false;
      updateSlider(i);
      });
  });



  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  updateSlider(i);
  requestAnimationFrame(render);
  function render() {
    if(right == true){
    counterFrames +=1;
    }
    else{
      counterFrames -=1;
    }
    if(counter <= 50){
      storedTime = counterFrames;
      counter +=1;
    }
    else{
      counterFrames = storedTime;
    }
    j = 0;
    twgl.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.enable(gl.DEPTH_TEST);
    
    const fieldOfViewRadians = degToRad(60);
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const projection = m4.perspective(fieldOfViewRadians, aspect, zNear, zFar);

    camera = m4.yRotation(degToRad(counterFrames));
    camera = m4.translate(camera, 0, 0, cameraZoom);
    var view = m4.inverse(camera);

    var viewProjectionMatrix = m4.multiply(projection, view)

    var currentCamera = [
      camera[12],
      camera[13],
      camera[14],
    ];
    console.log(cameraPosition);
    const sharedUniforms = {
      u_lightDirection: m4.normalize(currentCamera),
      u_view: view,
      u_projection: projection,
      u_viewWorldPosition: cameraPosition,
    };
    
    gl.useProgram(meshProgramInfo.program);
    var ii = 0;
    twgl.setUniforms(meshProgramInfo, sharedUniforms);

    var ii = 0;
    objectsToDraw.forEach(function(object){
  
      let u_world = m4.identity();
      var angle = ii * Math.PI * 2 / 7;
  
      var x = Math.cos(angle) * 30;
      var z = Math.sin(angle) * 30;
      u_world = m4.translate(u_world, x, 0, z);
      if(object.nome == "/boilerplate/Models/Sword6/swB.obj"){
        u_world = m4.scale(u_world, 7, 7, 7);
      }
      if(object.nome == "/boilerplate/Models/Sword3/Sting-Sword-lowpoly.obj"){
        u_world = m4.scale(u_world, 0.2, 0.2, 0.2);
      }
      if(object.nome == "/boilerplate/Models/Sword7/Sword.obj"){
        u_world = m4.scale(u_world, 7, 7, 7);
      }
      u_world = m4.yRotate(u_world, rotation[j+1]);
      u_world = m4.xRotate(u_world, rotation[j]);
      u_world = m4.zRotate(u_world, rotation[j+2]);
      u_world = m4.translate(u_world, ...object.offset);
      j += 3;
      ii += 1;

      for (const {bufferInfo, vao, material} of object.partes) {
        gl.bindVertexArray(vao);
        twgl.setUniforms(meshProgramInfo, {
          u_world,
        }, material);
        twgl.drawBufferInfo(gl, bufferInfo);
      }
    });
     requestAnimationFrame(render);
  }
}
main();
