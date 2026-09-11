const fs=require("node:fs");fs.rmSync("web-dist",{recursive:true,force:true});fs.cpSync("web-src","web-dist",{recursive:true});
