import json, sys, os, zlib, numpy as np
D=sys.argv[1]; OUT=sys.argv[2]; os.makedirs(OUT+"/tex", exist_ok=True)
tot=0
for i in range(6):
    j=json.load(open(f"{D}/m{i}.json")); b=open(f"{D}/m{i}.bin","rb").read(); H=j["nh"]
    partes=[]; off=0
    def meter(a):
        global off
        by=a.tobytes(); o=off; partes.append(by); off+=len(by); pad=(-off)%4
        if pad: partes.append(b"\0"*pad); off+=pad
        return o
    rd=lambda o,dt,c: np.frombuffer(b,dtype=dt,count=c,offset=o)
    for m in j["mallas"]:
        n=m["n"]
        m["pos"]=meter(rd(m["pos"],np.float32,n*3).copy())
        if m["nor"] is not None: m["nor"]=meter(rd(m["nor"],np.float32,n*3).copy())
        if m["uv"] is not None: m["uv"]=meter(rd(m["uv"],np.float32,n*2).copy())
        m["si"]=meter(rd(m["si"],np.uint16,n*4).copy()); m["sw"]=meter(rd(m["sw"],np.float32,n*4).copy())
        if m["idx"] is not None: m["idx"]=meter(rd(m["idx"],np.uint32,m["ni"]).copy())
    r=j["reposo"]
    rq=rd(r["q"],np.float32,H*4).reshape(H,4); rt=rd(r["t"],np.float32,H*3).reshape(H,3); rs=rd(r["s"],np.float32,H)
    j["reposo"]={"q":meter(rq.copy()),"t":meter(rt.copy()),"s":meter(rs.copy())}
    for nom,a in j["anims"].items():
        N=a["cuadros"]
        q=rd(a["q"],np.float32,N*H*4).reshape(N,H,4).copy(); t=rd(a["t"],np.float32,N*H*3).reshape(N,H,3)
        for f in range(1,N):   # misma mitad de la esfera que el cuadro anterior (interpolación suave)
            neg=(q[f]*q[f-1]).sum(1)<0; q[f][neg]*=-1
        a["q"]=meter(np.round(q*32767).astype(np.int16)); a["t"]=meter(np.round(t*100).clip(-32767,32767).astype(np.int16)); del a["s"]
    bin=b"".join(partes); co=zlib.compressobj(9, zlib.DEFLATED, -15); z=co.compress(bin)+co.flush()
    open(f"{OUT}/m{i}.bin.z","wb").write(z); json.dump(j,open(f"{OUT}/m{i}.json","w")); tot+=len(z); print(i,len(bin)//1000,"->",len(z)//1000,"KB")
print("total",tot//1000,"KB")
