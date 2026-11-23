import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=express();
const port=Number(process.env.PORT||3000);
const token=process.env.TMDB_API_READ_ACCESS_TOKEN;
app.use(express.json());
app.get('/api/health',(_req,res)=>res.json({ok:true,tmdbConfigured:Boolean(token)}));
app.get('/api/config',(_req,res)=>res.json({supabaseUrl:process.env.SUPABASE_URL||'',supabaseAnonKey:process.env.SUPABASE_ANON_KEY||''}));
app.get('/api/tmdb/*',(req,res,next)=>{
 if(!token){res.status(503).json({error:'TMDB API token is not configured'});return;}
	 const params=req.params as unknown as Record<string,string|string[]>;
	 const rawPath=params['0'];
	 const tail=Array.isArray(rawPath)?rawPath.join('/'):rawPath||'';
	 const allowed=/^(trending\/(movie|tv)\/(day|week)|movie\/(popular|now_playing|top_rated|upcoming)|tv\/(popular|top_rated|on_the_air)|discover\/(movie|tv)|search\/(movie|tv|multi)|movie\/\d+(\/(credits|videos|watch\/providers))?|tv\/\d+(\/(credits|videos|watch\/providers))?|person\/popular|person\/\d+|genre\/(movie|tv)\/list)$/.test(tail);
	 if(!allowed){res.status(400).json({error:'Unsupported TMDB endpoint'});return;}
	 const url=new URL(`https://api.themoviedb.org/3/${tail}`);
	 for(const [k,v] of Object.entries(req.query)) if(typeof v==='string') url.searchParams.set(k,v);
	 fetch(url,{headers:{Authorization:`Bearer ${token}`,accept:'application/json'}}).then(async r=>{res.status(r.status).json(await r.json());}).catch(next);
});
function start(){
 const root=path.resolve(__dirname,'../dist');
 app.use(express.static(root));
 app.get('*',(_req,res)=>res.sendFile(path.join(root,'index.html')));
 app.listen(port,'0.0.0.0',()=>console.log(`Aurora listening on ${port}`));
}
start();
