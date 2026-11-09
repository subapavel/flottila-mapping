// Run after npm run build. PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH can point at an installed Chromium.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';

const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
const artifact=new URL('../Mapping-studio.html',import.meta.url).href;
const names=['counter','ifWithoutElse','ifSWithoutElse','substring','concat','FixValues','Value mapping','JDBC Lookup','RFC Lookup','currentDate','DateTrans','DateBefore','DateAfter','CompareDates','Constant','CopyValue','replaceValue','SplitByValue','sort','sortByKey','mapWithDefault','index'];
const dates=names.slice(9,14);
const button=(box,name)=>box.getByRole('button',{name,exact:true});
async function verify(format){
  const page=await browser.newPage({viewport:{width:1440,height:1050}});
  page.setDefaultTimeout(6000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(artifact+'#definition');await page.getByRole('button',{name:'Edit',exact:true}).click();
    const cat=page.getByRole('region',{name:'Function catalogue'}),dlg=page.getByRole('dialog');
    await cat.waitFor();
    if(format==='JSON')for(const side of ['source','target']){
      await button(page,'Change '+side+' message').click();await dlg.getByRole('button',{name:/JSON/}).click();
    }
    const nodes=page.locator('.react-flow__node'),initial=await nodes.count();
    const field=name=>dlg.getByLabel(name,{exact:true});
    const toggle=name=>dlg.getByRole('switch',{name,exact:true});
    async function flip(control,from){
      assert.equal(await control.isChecked(),from);
      await control.press('Space');
      assert.equal(await control.isChecked(),!from);
    }
    const target=page.locator('#target-message-pane');
    await button(target,'Show Selection Column').click();
    const mark=target.getByRole('switch',{name:'Select /Doc/Grp',exact:true});
    await flip(mark,false);
    await button(target,'Selection column options').click();
    await page.getByRole('menuitem',{name:'Select None',exact:true}).click();
    assert.ok(!(await mark.isChecked()));
    await button(target,'Show Selection Column').click();
    async function value(name,v){assert.equal(await field(name).inputValue(),v,name);}
    async function add(name){
      await cat.getByRole('searchbox').fill(name);
      await cat.locator('.catalogue-function').filter({has:page.getByText(name,{exact:true})}).click();
      await button(page.locator('.react-flow__node.selected'),'Parameters for '+name).click();await dlg.waitFor();
    }
    for(const name of names){
      await add(name);
      if(name==='FixValues'){
        await button(dlg,'Cancel').click();
        await page.locator('.react-flow__node.selected .node-caption').dblclick();
        await page.getByRole('dialog',{name:'Fixed-Values Table',exact:true}).waitFor();
      }
      if(format==='XML'&&process.env.CAPTURE_DIALOG_REFERENCES==='1'){
        const dir=new URL('../sap-predloha/function-dialogs/prototype/',import.meta.url);
        await mkdir(dir,{recursive:true});
        const key={'Value mapping':'valuemap','JDBC Lookup':'tableLookup','RFC Lookup':'rfclookup'}[name]||name;
        await dlg.screenshot({path:fileURLToPath(new URL(encodeURIComponent(key)+'.png',dir)),animations:'disabled'});
      }
      const radio=(n)=>dlg.getByRole('radio',{name:n,exact:true});
      if(name==='counter'||name==='index'){await value('Initial Value','1');await value('Increment','1');}
      if(name==='index'){assert.ok(await radio('Reset Index to Initial Value with Each New Context').isChecked());await radio('Do Not Reset Index to Initial Value').check();}
      if(name==='substring'){await value('Start Position','0');await value('Character Count','0');}
      if(name==='concat')await value('Delimiter String','');
      if(name==='Constant')await value('Value','Constant');
      if(name==='CopyValue')await value('Index','0');
      if(name==='mapWithDefault')await value('Default Value to Be Mapped','');
      if(name==='replaceValue')await value('Value to Produce','');
      if(name.includes('WithoutElse'))await flip(toggle('Keep SUPPRESS Values'),false);
      if(name==='sort'||name==='sortByKey'){
        assert.equal(await dlg.getByRole('radio').count(),5);assert.ok(await radio('case sensitive').isChecked());assert.ok(await radio('ascending').isChecked());await radio('float number').check();await radio('descending').check();
      }
      if(name==='SplitByValue'){const sel=dlg.getByRole('combobox');assert.deepEqual(await sel.locator('option').allTextContents(),['Each Value','Empty Value','Value Change']);assert.equal(await sel.inputValue(),'0');await sel.selectOption('2');}
      if(name==='FixValues'){
        await value('key 1','key2');await value('value 1','value2');await value('key 2','key1');await value('value 2','value1');assert.ok(await radio('Use Default Value').isChecked());await radio('Throw Exception').check();await value('Default Value','');await button(dlg,'Add pair').click();await field('key 3').fill('new');await field('value 3').fill('saved');
        await button(dlg,'Remove pair 2').click();await value('key 2','new');await value('key 1','key2');
      }
      if(name==='Value mapping'){
        await value('Value-Mapping Context','http://sap.com/xi/XI');await value('Source Agency','SenderParty');await value('Target Agency','ReceiverParty');await value('Source Schema','');await value('Target Schema','');await value('Default Value','');assert.ok(await radio('Use Key').isChecked());
      }
      if(dates.includes(name)){
        const label=name==='currentDate'?'Target Date Format':name==='DateTrans'?'Input Date Format':'Format of First Date';await value(label,'yyyy/MM/dd');
        if(name!=='currentDate')await value(name==='DateTrans'?'Output Date Format':'Format of Second Date','yyyy/MM/dd');
        await button(dlg,'Show Advanced Properties').click();await value('First Weekday','Sunday');await value('Minimum Number of Days Required in First Week','1');await flip(toggle('Calendar Is Lenient'),true);
        if(name==='currentDate'){
          await field('First Weekday').selectOption('Monday');await button(dlg,'Choose '+label).click();
          await field('Date format').selectOption('yyyyMMdd');await field('Date Separator').selectOption('-');await field('Time format').selectOption('HHmmss');await field('Time Separator').selectOption(':');await button(dlg,'Apply format').click();await value(label,'yyyy-MM-dd HH:mm:ss');
          await button(dlg,'Choose '+label).click();await button(dlg,'Cancel').click();await value(label,'yyyy-MM-dd HH:mm:ss');
        }
      }
      if(name.endsWith('Lookup')){
        const rfc=name==='RFC Lookup';assert.ok(await field('Communication Channel').isDisabled());await flip(toggle(rfc?'Use Exception':'Insert Context Change After Each Result Value'),false);
        for(const list of rfc?['Import fields','Export fields']:['Input fields','Output fields'])assert.ok(await button(dlg,'Remove selected field from '+list).isDisabled());
        await button(dlg,rfc?'Choose RFC module':'Choose database table').click();
        if(rfc){await button(dlg,'SXIDEMO_AIRL_FLIGHT_CHECKAVAIL').click();await button(dlg,'Apply').click();await dlg.getByText('SXIDEMO_AIRL_FLIGHT_CHECKAVAIL',{exact:true}).waitFor();}
        else {await dlg.getByText('No Suitable Data Found').waitFor();assert.ok(await button(dlg,'Apply').isDisabled());await button(dlg,'Cancel').click();}
      }
      await button(dlg,'Apply').click();await dlg.waitFor({state:'hidden'});
      const node=page.locator('.react-flow__node.selected');
      if(name.includes('WithoutElse')){
        await button(node,'Parameters for '+name).click();await flip(toggle('Keep SUPPRESS Values'),true);
        await button(dlg,'Cancel').click();await button(node,'Parameters for '+name).click();
        assert.ok(await toggle('Keep SUPPRESS Values').isChecked());await button(dlg,'Cancel').click();
      }
      if(name==='sort'||name==='currentDate'){
        await button(node,'Parameters for '+name).click();
        if(name==='sort'){assert.ok(await radio('descending').isChecked());await radio('ascending').check();await button(dlg,'Cancel').click();await button(node,'Parameters for '+name).click();assert.ok(await radio('descending').isChecked());}
        else {await value('Target Date Format','yyyy-MM-dd HH:mm:ss');await button(dlg,'Show Advanced Properties').click();await value('First Weekday','Monday');assert.ok(!(await toggle('Calendar Is Lenient').isChecked()));}
        await button(dlg,'Cancel').click();
      }
      await node.focus();await page.keyboard.press('Delete');await page.waitForFunction(n=>document.querySelectorAll('.react-flow__node').length===n,initial);
    }
    assert.deepEqual(errors,[]);console.log(format+': all '+names.length+' native reference dialogs passed');
  }finally{await page.close();}
}
try{await Promise.all(['XML','JSON'].map(verify));}finally{await browser.close();}

