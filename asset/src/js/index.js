// Path: build/html/modules/EdtfDataType/asset/src/index.js

import { parse } from 'edtf';
import $ from 'jquery';

// add listener to the #edtf-value input for changes

const parser = function(container) {
    console.log("fired");
    var outputString = ""
    var shortExplanation = "";
    var caretLocation, caretOffset = 0;

    try {
        parse(container.value);
        $(container).closest('.edtf').find('.invalid-value').empty();
        const validString = 
        "<div class='valid-string-container'>" +
             "<span class='o-icon-edit icon' title='Correct value' aria-label='accepted value'></span>"+
             "<span class='valuesuggest-id'>" + container.value + "</span>" +
         "</div>";
        var validStringContainer = $(container).closest(".edtf").find(".valid-string-container");
        
        if(validStringContainer.length > 0) {
            $(validStringContainer).replaceWith(validString);
        } else {
                $(container).closest(".edtf").prepend(validString);
        }
        outputString, shortExplanation = "";

    } catch (e) {
        
        var message = String(e.message)

        const lines = message.split('\n');
        lines.forEach((line,i) => {
            switch (true) {
                case /Unexpected/.test(line):
                    shortExplanation = line.substring(0, line.indexOf("."));
                    break;
                case /Syntax/.test(line):
                    //console.log("-- " + lines[i+2]);
                    // get the consistently second line after the syntax error line
                    // only take the section after the space
                    outputString = lines[i+2].split(" ")[1];
                    caretOffset = lines[i+2].split(" ")[0].length + 1;
                    break;
                case /\^/.test(line):
                    //console.log("-- " + line);
                    // count the charaters in the string before the caret accounting for the spaces that are removed
                    caretLocation = line.indexOf("^") - caretOffset;
                    break                         
                default:
                    console.log("-- " + line + "\n");
                    break
            }
        })

        // @todo if there is a match... output the human readable to the screen! Something like valuesuggest:

        if (outputString.length > 0) {
            outputString = "<div><p class='outputstring'>" + 
                outputString.substring(0, caretLocation ) +
                "<span class='caret'>" +  outputString.substring(caretLocation, caretLocation + 1) + "</span>" +
                outputString.substring(caretLocation + 1) + 
                " [" + shortExplanation + "]" +
                "</p></div>";
        }

        $(container).closest('.edtf').find('.invalid-value').html(outputString);
        $(container).closest('.edtf').find('.valid-string-container').remove();
    }
}


const listen = function() {
    //needs to hook into the button that add's new fields as only the first one activates...
    
    var inputs = document.querySelectorAll('.edtf input.edtf-value');
    console.log("firing")
    console.log(input)
    
    inputs.forEach(input => {
        parser(input)
        input.addEventListener('input', function(e)
        {   
            parser(e.target)
        });

    });

    $(document).on('o:prepare-value o:prepare-value-annotation', function(e, type, value) {
        if ('edtf:date' === type) {
            console.log("new value to work with")
        }
    });
}




export { 
    listen };