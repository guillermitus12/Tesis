var bd=require('../routes/db_connect/db');
var R = require("r-script")
var parseJSON = require('./parseR/parseJSON');
var parser = new parseJSON();
var pdfBuilder = require('./PDFBuilder');
var builder = new pdfBuilder();
var plotly = require('./PlotlyGenerator');
var plotlyGenerator = new plotly();

process.on('message', (msg) => {

    req =  msg;
    var project_id = req.project_selected;
    var dataset_id = req.dataset_selected;
    var algorithm = req.algorithm_selected;
    var show_consensus = req.show_consensus_selected;
    var tab_name = req.dataset_name;
    var user_id = req.user_id;
    
    console.log("Run --> Procrustes Analize ");
    var params = {};
    var excluded_landmark = req.excluided_landmark;
    var excluded_specimen = req.excluided_specimen;
    params.excluded_land = excluded_landmark;
    params.excluded_spec = excluded_specimen;
    var data;
    //obtengo dataset
    bd.query('SELECT * FROM dataset_json where project_id = $1 and dataset_id = $2',[project_id,dataset_id],function(err, result){
      if(err){
          res.status(200).json({ "error": "Error in request." });
        }
        else{
          data = result.rows[0];
          //corro el algoritmo
          params.original_name = data['dataset_name']             
          var dim_spec = (data['numbers_of_specimen']-excluded_specimen.length);
          var dim_land = (data['numbers_of_landmark']-excluded_landmark.length);
          params.numbers_of_specimen = dim_spec;
          params.numbers_of_landmark = dim_land;
          var out;
          var prefix = '';
          params.dimention = data['dimention'];       
          switch(algorithm){
            case 1:data['dimention']
              out = R("r_scripts/ProcrustesCM.R")
              .data({"num_specimen" : dim_spec,"num_landmark": dim_land,"dim": data['dimention'] , "data": parser.generateArraySpecimensAnalize(data['specimens'],excluded_specimen,excluded_landmark) })
              .callSync();
              prefix = !show_consensus ? 'GlsP_' : 'GlsP_Consensus_';
              params.algorithm = 'Least-Squares Procrustes Superimposition'
            break;
            case 2:
              var iterations = req.iterations;
              var tolerance = req.tolerance;
              out = R("r_scripts/ProcrustesRobust.R")
              .data({"num_specimen" : dim_spec,"num_landmark": dim_land ,"dim": data['dimention'] , "data": parser.generateArraySpecimensAnalize(data['specimens'],excluded_specimen,excluded_landmark), "show_consensus" : show_consensus ,"tolerance": tolerance, "iter": iterations })
              .callSync();
              prefix =  !show_consensus ? 'GrP_' : 'GrP_Consensus_' ;
              params.algorithm = 'Resistant Procrustes Superimposition'
            break;
          }
          dataParse = parser.parseDataR(out,show_consensus,algorithm);
          dataParse.colors = data['colors'];         
          //special case of CM algorithm
          if(algorithm == 1 && show_consensus){
            var name = 'specimen'+(dataParse.specimens.length);
            var consenso = JSON.parse(out);
            dataParse.specimens.data.push( { [name] : consenso['consensus'] } );
            dataParse.numbers_of_specimen = dataParse.numbers_of_specimen + 1;
            dataParse.colors.push('#ea0b0b');//aparecera en ROJO
          }
          dataParse.specimens.excluded_land = excluded_landmark.concat(data['specimens']['excluded_land']);
          dataParse.specimens.excluded_spec = excluded_specimen.concat(data['specimens']['excluded_spec']);
          dataParse.specimens.root_number_landmarks = data['specimens']['root_number_landmarks'];
          dataParse.specimens.root_number_specimens = data['specimens']['root_number_specimens'];
          params.data = dataParse.specimens.data;
          dataParse.specimens.numbers_of_specimens  = data['numbers_of_specimen'];
          dataParse.specimens.numbers_of_landmarks = data['numbers_of_landmark'];
          dataParse.project_id = data['project_id'];    
          //reutilizo los nombres 
          if(JSON.stringify(data['specimen_name']) !== JSON.stringify({})){
            dataParse.specimen_name = data['specimen_name'];
          } 
          if(show_consensus){
            dataParse.specimen_name.push("Consensus");
          }
          var cleanList = [];
          for (let index = 0; index < dataParse.specimen_name.length; index++) {
            const element = dataParse.specimen_name[index];
            if(!excluded_specimen.includes(index.toString())){
                cleanList.push(element);
            }
          }
          dataParse.specimen_name = cleanList;
          dataParse.dataset_id_ref =  data['dataset_id'];
          dataParse.project_id_ref = data['project_id'];        
          params.specimen_name = dataParse.specimen_name;
          show_consensus = show_consensus ? 1 : 0;
          bd.query('INSERT INTO dataset_json values(DEFAULT,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,1,NULL) RETURNING dataset_id',[data['project_id'],data['dataset_name'],prefix+data['file_name'],dataParse.numbers_of_specimen,dataParse.numbers_of_landmark,dataParse.dimention,JSON.stringify(dataParse.specimens),JSON.stringify(dataParse.colors),JSON.stringify(dataParse.specimen_name),data['dataset_id'],data['project_id'],show_consensus], function(err, result){
                if(err){
                  console.log(err);
                  process.send({ "error": "Error in the connection with database." });
                }
                else{
                  //actualizo el nombre
                  if(tab_name.length > 0){
                    dataParse.dataset_name = prefix+tab_name;
                  }else{
                    dataParse.dataset_name = prefix+data['dataset_name']+'_'+result.rows[0].dataset_id;
                  }
                  dataParse.name = tab_name;
                  dataParse.dataset_id = result.rows[0].dataset_id;
                  params.name = tab_name;
                  //PDF GENERATION
                  dataParse.pdf = builder.generatePDF_Dataset(params);
                  bd.query('UPDATE dataset_json SET dataset_name = $1,pdf = $3 WHERE dataset_id = $2',[prefix+data['dataset_name']+'_'+result.rows[0].dataset_id,result.rows[0].dataset_id, JSON.stringify(dataParse.pdf) ], function(err, result){
                    bd.query('SELECT first_name,email_address FROM app_user WHERE user_id = $1',[user_id], function(err, result){                
                      if(err){
                        console.log(err);
                        process.send( { "error": "Error in the connection with database." });
                      }
                      console.log(JSON.stringify(req.session));
                         
                    });                    
                    if(dataParse.dimention == 3){
                      dataParse.data_plotly =  plotlyGenerator.generateGraphicsPlotly3D(dataParse);
                      dataParse.layout = plotlyGenerator.getLayoutPlotly3D(algorithm,dataParse.dataset_name);
                    }else{  
                        dataParse.data_plotly =  plotlyGenerator.generateGraphicsPlotly2D(dataParse);
                        dataParse.layout = plotlyGenerator.getLayoutPlotly2D(algorithm,dataParse.dataset_name);
                    }  
                    
                    console.log("Finished --> Procrustes Analize ");
                    process.send(dataParse);                
                  });
                }   
              });
      }
    });
  


  });
