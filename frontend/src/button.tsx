const buttonlayers = 3;

type point = {x: number, y: number};

function clamplr(x: number,l: number, r: number){
    if(x<l){
        return l
    }
    if(x>r){
        return r
    }
    return x
}

//TODO: Figure out the minutia of this stuff right here

function boxdist(mouse: point, reccenter: point, recdims: point): number{
    return clamplr(1-(Math.abs(mouse.x-reccenter.x)/(recdims.x/2)),0,1)*clamplr(1-(Math.abs(mouse.y-reccenter.y)/(recdims.y/2)),0,1)
}

export function Button(reccenter:point, recdims:point, text: string, onClickfun: ()=>void, mouse: point){
const centerdist = 2*boxdist(mouse,reccenter,recdims)
return <g>
                        <rect
                        key = {"Button " + text}
                        x = {reccenter.x-recdims.x/2}
                        y = {reccenter.y-recdims.y/2}
                        width = {recdims.x}
                        height = {recdims.y}
                        fill = "hsl(0 0% 100%)"
                        stroke = "hsl(0 0% 100%)"
                        onClick={()=>{onClickfun()}}
                        strokeWidth= "1"
                        />
                        {Array.from(Array(buttonlayers).keys()).map((layernum)=>{
                            const rectmargin = 10*clamplr(buttonlayers*2*centerdist,0,layernum+1)
                            return <rect
                            key = {"Button outline " + text + "-" + layernum.toString()}
                            x = {reccenter.x-recdims.x/2-rectmargin/2}
                            y = {reccenter.y-recdims.y/2}
                            width = {recdims.x + rectmargin}
                            height = {recdims.y + rectmargin}
                            fill = "none"
                            stroke = "hsl(0 0% 100%)"
                            // onClick={()=>{redirect()}}
                            strokeWidth= "1"
                            />
                        })}
                        <text
                        key = {"nav label " + text}
                        x = {reccenter.x}
                        y = {reccenter.y}
                        text-anchor="middle"
                        dominant-baseline = "central"
                        fontSize={0.1*recdims.x}
                        letterSpacing={5*recdims.x/200}
                        // textLength={0.75*widd}
                        fill = "hsl(0 0% 0%)"
                        fontFamily='Helvetica'
                        fontWeight= "bold"
                        onClick={()=>{onClickfun()}}
                        >
                            {text}
                        </text>
                    </g>
}