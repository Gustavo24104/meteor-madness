// import { useState } from 'react'
import './App.css'

const API_KEY = import.meta.env.VITE_NASA_API_KEY;

function App() {
  // const [count, setCount] = useState(0)

  
  return (
    <>
      <div>
      </div>
      <h1>Asteroid search</h1>
      <div className="card">
        <label htmlFor="asteroid_query">Insert name/SPKID, you can use '*' as a wildcard: </label>
        <br></br>
        <input type="text"
            id="asteroid_query"
            name="asteroid_query"
            required></input>
          <br></br>
          <br></br>
        <button onClick={ SDBDQuery }>
          Search asteroid
        </button>
      </div>
    </>
  )
}

function SDBDQuery() {
  let pesquisa :String = (document.getElementById("asteroid_query") as 
  HTMLInputElement).value;
  let limpo :String = pesquisa.trim();
  // limpo = limpo.toLowerCase();
  if(!limpo) {
    alert("pesquisa vazia!");
    return;
  }

  //limpo += "*";
  let url = "http://localhost:3001/api/nasa-sbdb?sstr=" + limpo.toLowerCase();
  fetch(url)
  .then(response => {
    if (!response.ok) {
      if(response.status != 300) throw new Error('A resposta da rede não foi OK: ' + response.status);
    }
    return response.json();
  })
  .then(data => {
    // alert(JSON.stringify(data));
    const SDBDData = JSON.parse(JSON.stringify(data));
    
    if(SDBDData.code == 300) {
      ShowPossibleOptions(SDBDData);
      return;  
    }

    if(SDBDData.code == 200) {
      alert("Not found!\n");
      return;
    }

    if(SDBDData.object.neo == false) {
      alert("Found an object, but it is not a NEO or data unavailable");
      return;
    }

    alert("Found: " + SDBDData.object.fullname);
    NEOQuery(SDBDData.object.spkid);    
    console.log("Original spkid: " + SDBDData.object.spkid);
  })
  .catch(error => {
    console.error('Erro ao buscar dados:', error);
  });



}

function NEOQuery(spkid: String) {
  /* Estranho: no JPL as entradas que começam com 2 sempre tem algum zero a mais, então
  tem que tirar um deles pra conseguir achar o objecto corrreto na API do NEOW */
  if(spkid.at(0) === '2') {
    spkid = spkid.slice(0,1) + spkid.slice(2);
  }
  console.log("Corrected spkid: " + spkid);
  let url = "http://localhost:3001/api/nasa-neo?api_key=" + API_KEY + "&spkid=" + spkid;
  fetch(url)
  .then(response => {
    if (!response.ok) {
      throw new Error('A resposta da rede não foi OK: ' + response.status);
    }
    return response.json();
  })
  .then(data => {
    alert(JSON.stringify(data));
    const SDBDData = JSON.parse(JSON.stringify(data));
  
    alert("Found: " + SDBDData.object.fullname);
    NEOQuery(SDBDData.object.spkid);    
    console.log("Original spkid: " + SDBDData.object.spkid);
  })
  .catch(error => {
    console.error('Erro ao buscar dados:', error);
  });

}

function ShowPossibleOptions(SDBDData: any) {
  let possibilites: String = "";
  const objs = SDBDData.list;
  for(var o in objs) {
    console.log(SDBDData.list[o].pdes);
    possibilites += SDBDData.list[o].pdes + ": \"" + SDBDData.list[o].name + " \"\n";
  }
  alert("Multiples matches detected, select one of the following:\n" + possibilites);
}

export default App
