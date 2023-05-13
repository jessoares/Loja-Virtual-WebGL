var objectsToDraw = [];   //Lista com todos objetos da loja
var boughtObjects = [];   // Lista para objetos que o usuário comprou
var currentObjects = []; //Objetos renderizados no momento, carrinho ou loja

//Variaveis relevantes ao método de parsing do arquivo
var range;                
var extents;
    
var objOffset;       //variavel paara mover erobjeto para que sua geometria fique em seu centro

// Variaveis relevantes a camera:
var cameraTarget    
var radius;
var cameraPosition;
var cameraOption = 1;
var zNear;
var zFar;

var counterFrames = 0; //Contador de frames para a duração da animalão da camera
var storedTime = 0;   // Armazena "tempo" em que a camera se encontra com a animação pausada
var counter = 101;    //limite máximo de frames por animação
var right = true;    // movimentação da camera

var height = 0;        //Altura da camera para troca de posição
var bought = 0;        //Quantos objetos no carrinho

var cores = [[1,0,0,1],[0,0,1,1],[1,1,1,1]]; //Vermelho azul Amarelo
var dados;         
var k = 0;
var i = 6;                       // Indexadores para rotações e listas
var j = 0;  





//Funções usadas no parsing do arquivo

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
      if (i === 0 && objColors.length > 1) {
        geometry.data.color.push(...objColors[index]);
      }
    });
  }
  const keywords = {
    v(parts) {
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
    s: noop,    
    mtllib(parts) {
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
      console.warn('unhandled keyword:', keyword);  
      continue;
    }
    handler(parts, unparsedArgs);
  }
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
      console.warn('unhandled keyword:', keyword);  
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










/////////////////////////////////////////////////////////     MAIN          /////////////////////////////////////////////////////////////////////////////

async function main() {

  const { gl, meshProgramInfo } = initializeWorld();              //Inicializa programa

  async function readOBJ(objName){
    const objHref = objName;  
    const response = await fetch(objHref);
    const text = await response.text();
    const obj = parseOBJ(text);
    const baseHref = new URL(objHref, window.location.href);                  //Cria path para leitura do mtl
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
    const defaultMaterial = {          //Uniforms 
      diffuse: [1, 1, 1],
      diffuseMap: textures.defaultWhite,
      normalMap: textures.defaultNormal,
      ambient: [0, 0, 0],
      specular: [1, 1, 1],
      specularMap: textures.defaultWhite,
      shininess: 400,
      opacity: 1,
    };
    const parts = obj.geometries.map(({material, data}) => {        // coloca dados do arquivo em um buffer e um vertex array e estes armazenados em parts
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
      dados = data;

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

    function getExtents(positions) {       //Ajuste do objeto
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


    objectsToDraw.push({       //cria um objeto por chamada em uma lista
      nome: objName,
      partes: parts,
      offset: objOffset,
      fullData: dados,
    });
      
  }



  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                    
  await readOBJ('/Models/Sword1/sword-01.obj');         
  await readOBJ('Models/Sword2/KubikiribochoEND.obj');
  await readOBJ('/Models/Sword3/Sting-Sword-lowpoly.obj');
  await readOBJ('/Models/Sword4/w026.obj');
  await readOBJ('/Models/Sword5/Ancient Sword.obj')
  await readOBJ('/Models/Sword6/swB.obj')
  await readOBJ('/Models/Sword7/Sword.obj')
  currentObjects = objectsToDraw;
                    // array com rotações xyz de cada objeto                                                      
  var rotation = [degToRad(360),degToRad(360),degToRad(180),degToRad(180),degToRad(300),degToRad(269),degToRad(269),degToRad(180),degToRad(269),degToRad(90),degToRad(269),degToRad(269),degToRad(90),degToRad(269),degToRad(269),degToRad(180),degToRad(0),degToRad(50),degToRad(180),degToRad(180),degToRad(180)];
  var cameraZoom = 60;        //Zoom camera





//////////////////////////////////////////////// UI //////////////////////////////////////////////////////////////////////

  function updateSlider(index)           //Sliders 
  {
    webglLessonsUI.setupSlider("#angleX", {value: radToDeg(rotation[index]), slide: updateRotation(index), max: 360});
    webglLessonsUI.setupSlider("#angleY", {value: radToDeg(rotation[index+1]), slide: updateRotation(index+1), max: 360});
    webglLessonsUI.setupSlider("#angleZ", {value: radToDeg(rotation[index+2]), slide: updateRotation(index+2), max: 360});
    webglLessonsUI.setupSlider("#zoom", {value: radToDeg(cameraZoom), slide: updateZoom(),min: 40, max: 70});
  }

  function updateRotation(index) {          //Atualiza valor da rotação da coordenada x,y ou z de um objeto para sua atualização do render
    return function(event, ui) {     
       var angleInDegrees = ui.value;
      var angleInRadians = degToRad(angleInDegrees);
      rotation[index] = angleInRadians;
    };
  }

  function updateZoom() {                 //Idem para zoom
    return function(event, ui) {
      cameraZoom = ui.value;
    };
  }

///////////////////////////////////////////////////////// BOTÕES ////////////////////////////////////////////////////

  const elem = document.querySelector('#toggleright');          //Rotação da camera para direita, encontra o index do proximo objeto na roda
  elem.addEventListener('click', () => {
    canvas.toBlob(() => {
      if (i == 0) {
        i = 18;                              
      }
      else if(i == 3) {
        i = 0;
      }
      else if(i == 6){
        i = 3;
      }
      else if(i == 18){
        i = 15;
      }
      else if(i == 15){
        i = 12;
      }
      else if(i == 12){
        i = 9;
      }
      else if(i == 9)
      {
        i = 6;
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
      else if(i == 9){
        i = 12;
      }
      else if(i == 12)
      {
        i = 15;
      }
      else if(i == 15)
      {
        i = 18;
      }
      else if(i == 18)
      {
        i = 0;
      }
      counter = 0;
      right = false;
      updateSlider(i);
      });
  });

  const elem3 = document.querySelector('#buy');          //Compra o objeto, encontra o index deste e o coloca em uma nova lista para renderização
  elem3.addEventListener('click', () => {
    canvas.toBlob(() => {
      if(cameraOption == 1 && bought < 7)
      {
       if(i!=0)
        {
          var jj = i/3;
        }
        else{
          var jj = i;
        }
        boughtObjects.push(objectsToDraw[jj]);
        bought+=1;
      }
    });
  });

  
  const elem4 = document.querySelector('#carrinho');          //Escolhe o que será renderizado atualmente
  elem4.addEventListener('click', () => {
    canvas.toBlob(() => { 
    if(bought > 0 && cameraOption == 1)
    {
      currentObjects = boughtObjects;
      cameraOption = 2;
      height = 10;
    }
    else if(bought > 0 && cameraOption == 2){
      currentObjects = objectsToDraw;
      cameraOption = 1;
      height = 0;
    }
    });
  });

  const elem5 = document.querySelector('#color');         
  elem5.addEventListener('click', () => {
    canvas.toBlob(() => { 
    if(i!=0)
    {
      var jj = i/3;
    }
    else{
      var jj = i;
    }
    objectsToDraw[jj].fullData.color = {value: cores[k]};
    for (var {bufferInfo, vao} of objectsToDraw[jj].partes) 
    {
      bufferInfo = twgl.createBufferInfoFromArrays(gl, objectsToDraw[jj].fullData);
      vao = twgl.createVAOFromBufferInfo(gl, meshProgramInfo, bufferInfo);
    }
    k+=1;
    if(k>2){
      k = 0;
    }
  });
  });

  ////////////////////////////////////////////////   RENDER   //////////////////////////////////////////////////////////////////
  updateSlider(i);
  requestAnimationFrame(render);



  function render() {
    if(right == true){
    counterFrames +=1;                     // Se a direção atual é direita, o contador ira somar 1 em cada frame para o calculo do angulo de rotação da camera
    }
    else{
      counterFrames -=1;                //-1 cc
    }
    if(counter <= 50){                //Enquanto este contador for abaixo de 50 frames, não congela o "tempo"
      storedTime = counterFrames;
      counter +=1;
    }
    else{
      counterFrames = storedTime;     //"tempo" constante cc
    }
    j = 0;

    twgl.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.enable(gl.DEPTH_TEST);
    
    const fieldOfViewRadians = degToRad(60);
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const projection = m4.perspective(fieldOfViewRadians, aspect, zNear, zFar);    //matrix para visualização em perspectiva
                                                
    var camera = m4.yRotation(degToRad(counterFrames));          //rotaciona a camera apartir do angulo
    camera = m4.translate(camera, 0, height, cameraZoom);             //ao mesmo tempo faz a translação, resultando em curva
    var view = m4.inverse(camera);                               //inverso para calculo das posições!!!!!!!!!
    var currentCamera = [                                          //posição atual xyz da camera na sua matriz para uso de luz a partir da camera
      camera[12],
      camera[13],
      camera[14],
    ];
    const sharedUniforms = {
      u_lightDirection: m4.normalize(currentCamera),        //!!!
      u_view: view,
      u_projection: projection,
      u_viewWorldPosition: cameraPosition,
    };
    
    gl.useProgram(meshProgramInfo.program);
    var ii = 0;                                             

    twgl.setUniforms(meshProgramInfo, sharedUniforms);

    var ii = 0;
    currentObjects.forEach(function(object){
      let u_world = m4.identity();
      var angle = ii * Math.PI * 2 / 7;         //angulo para renderização dos objetos em um circulo
  
      var x = Math.cos(angle) * 30;
      var z = Math.sin(angle) * 30;
      u_world = m4.translate(u_world, x, height, z);               //coloca objeto na posição
      if(object.nome == "/Models/Sword6/swB.obj"){   //Escalonamentos de tamanho de objetos
        u_world = m4.scale(u_world, 7, 7, 7);
      }
      if(object.nome == "/Models/Sword3/Sting-Sword-lowpoly.obj"){
        u_world = m4.scale(u_world, 0.2, 0.2, 0.2);
      }
      if(object.nome == "/Models/Sword7/Sword.obj"){
        u_world = m4.scale(u_world, 7, 7, 7);
      }
      u_world = m4.xRotate(u_world, rotation[j]);
      u_world = m4.yRotate(u_world, rotation[j+1]);     //rotações a partir do slider
      u_world = m4.zRotate(u_world, rotation[j+2]);
      u_world = m4.translate(u_world, ...object.offset);    //mantem objeto em seu centro e posição
      j += 3;           //index para rotações dos outros objetos
      ii += 1;                      

      for (var {bufferInfo, vao, material} of object.partes) {
        gl.bindVertexArray(vao);
        twgl.setUniforms(meshProgramInfo, {
          u_world,
        }, material);
        twgl.drawBufferInfo(gl, bufferInfo);                 //Desenha o objeto a partir das partes na posição atual da lista
      }
    });
    requestAnimationFrame(render);
  }
}
main();
